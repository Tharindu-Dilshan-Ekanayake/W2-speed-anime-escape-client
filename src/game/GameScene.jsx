import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { bootStep } from './boot'
import { GRAVITY } from './config'
import FollowCamera from './FollowCamera'
import Footprints from './fx/Footprints'
import { GlowClock } from './fx/Glow'
import { LevelUpBursts } from './fx/LevelUp'
import { Confetti, SpeedPopups } from './fx/Popups'
import RunFx from './fx/RunFx'
import Player from './Player'
import RemotePlayers from './RemotePlayers'
import { runtime } from './runtime'
import { useGame } from './store'
import Environment from './world/Environment'
import { pendingUploads } from './textures'
import { precompileScene, warmUp } from './world/warmup'
import World from './world/World'

/**
 * Fires `onReady` once a few frames have really been drawn, so the loading
 * screen only lifts when the game is on screen.
 */
function FrameWatch({ onReady, armed }) {
  const frames = useRef(0)
  const fired = useRef(false)
  useFrame((state) => {
    runtime.time = state.clock.elapsedTime
    if (!armed || fired.current) return
    frames.current += 1
    if (frames.current > 8) {
      fired.current = true
      onReady()
    }
  })
  return null
}

/** Compiles the shaders and textures every stage will use, before the game shows. */
function WarmUp() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    warmUp(gl, camera)
  }, [gl, camera])
  return null
}

/** Pre-compiles the scene's shaders once it has loaded, and again after every move to a new stage. */
function Precompile() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let timer = setTimeout(() => precompileScene(gl, scene, camera), 2500)
    const unsub = useGame.subscribe((s, prev) => {
      if (s.zone === prev.zone) return
      clearTimeout(timer)
      // Wait for the new stage's pieces to finish mounting.
      timer = setTimeout(() => precompileScene(gl, scene, camera), 2500)
    })
    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [gl, scene, camera])
  return null
}

/**
 * Sends new canvas textures (signs, labels) to the GPU one per frame, as soon
 * as they exist - not in the frame they first come into view, which stalled.
 */
function TextureUploader() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    const texture = pendingUploads.shift()
    if (texture) gl.initTexture(texture)
  })
  return null
}

export function GameScene() {
  const { game } = useBloxity()
  const playerBodyRef = useRef(null)
  const loaded = useGame((s) => s.loaded)
  const [avatarReady, setAvatarReady] = useState(false)
  // Render resolution: starts crisp and backs off by itself if the frame rate drops.
  const [dpr, setDpr] = useState(1.5)
  const ended = useRef(false)

  const handleAvatarReady = useCallback(() => {
    setAvatarReady(true)
    bootStep('avatar', 'Almost there…')
  }, [])

  const handleFrames = useCallback(() => {
    if (ended.current) return
    ended.current = true
    bootStep('frames', 'Go!')
    game.loadingEnd()
  }, [game])

  useEffect(() => {
    game.loadingStep('Building the escape…')
  }, [game])

  // Never hang on the loading screen: if the avatar takes too long, go anyway.
  useEffect(() => {
    const id = setTimeout(() => setAvatarReady(true), 12000)
    return () => clearTimeout(id)
  }, [])

  return (
    <Canvas
      flat
      shadows="percentage"
      dpr={Math.min(dpr, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 6, 46], fov: 70, near: 0.1, far: 520 }}
      onCreated={(state) => {
        bootStep('world', 'Spawning runner…')
        if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE === '1') window.__three = state
      }}
    >
      <GlowClock />
      <WarmUp />
      <Precompile />
      <TextureUploader />
      <Environment />
      <Suspense fallback={null}>
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60}>
          <World />
          {/* The player (and so their avatar) appears only once Bloxity has said who is playing. */}
          {loaded && <Player bodyRef={playerBodyRef} onAvatarReady={handleAvatarReady} />}
          <RemotePlayers />
          <FollowCamera bodyRef={playerBodyRef} />
        </Physics>
      </Suspense>
      <RunFx />
      <Footprints />
      <SpeedPopups />
      <LevelUpBursts />
      <Confetti />
      <FrameWatch onReady={handleFrames} armed={avatarReady && loaded} />
      <PerformanceMonitor
        flipflops={4}
        onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(1.5, d + 0.25))}
      />
    </Canvas>
  )
}

export default GameScene
