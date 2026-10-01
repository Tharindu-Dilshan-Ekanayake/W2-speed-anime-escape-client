import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
} from 'three'

import { TRIAL_NAMES, walkDisplay } from '../config'
import { glowClock, RisingSparks } from '../fx/Glow'
import { killPlayer } from '../gameplay'
import { unitBox, unitSphere } from '../materials'
import { runtime } from '../runtime'
import { sfx } from '../sfx'
import { useGame } from '../store'
import { useZone } from '../zones'
import { fluidMaterial } from './Fluid'
import { Block, Label3D, Sign } from './Primitives'
import { useStaged } from './useStaged'

/**
 * Speed trials. Crossing the start line wakes a hazard just behind the runner
 * that moves at `seg.speed` - a touch slower than the stage level's top walk
 * speed. Run flat out at that level and you stay ahead; a level lower (or a
 * walk speed adjusted down) and it catches you about two thirds of the way.
 *
 * The look of the chaser depends on `seg.chaser`; the rule is the same for all.
 */

const LOOKS = {
  bridge: { wall: '#c89a6a', glow: '#ffd08a', fluid: null, path: 'bridge' },
  lava: { wall: '#e8360a', glow: '#ffb03a', fluid: 'lava', path: 'corridor' },
  acid: { wall: '#3ab81a', glow: '#c8ff7a', fluid: 'acid', path: 'corridor' },
  wave: { wall: '#1f9aff', glow: '#e8fbff', fluid: 'water', path: 'beach' },
  avalanche: { wall: '#ffffff', glow: '#cfefff', fluid: 'cloud', path: 'corridor' },
  sandstorm: { wall: '#e8b070', glow: '#fff0c8', fluid: null, path: 'corridor' },
  storm: { wall: '#2a2a3a', glow: '#ffe23a', fluid: null, path: 'corridor' },
  laserwall: { wall: '#ff1f3a', glow: '#ff9aaa', fluid: null, path: 'corridor' },
  shadow: { wall: '#1a0630', glow: '#c86aff', fluid: 'void', path: 'corridor' },
}

const _o = new Object3D()

/** The chasing wall: a cluster of big blobs + a bright leading edge. */
function ChaserWall({ look, width, frontRef, kind }) {
  const COUNT = 26
  const mesh = useMemo(() => {
    const solid = kind === 'laserwall' || kind === 'storm' || kind === 'shadow'
    const material = solid
      ? new MeshBasicMaterial({ color: look.wall, transparent: true, opacity: 0.85, toneMapped: false })
      : new MeshLambertMaterial({ color: look.wall, emissive: new Color(look.wall), emissiveIntensity: kind === 'lava' || kind === 'acid' ? 0.4 : 0.2, transparent: true })
    material.userData.full = solid ? 0.85 : 1
    const m = new InstancedMesh(kind === 'laserwall' ? unitBox : unitSphere, material, COUNT)
    m.frustumCulled = false
    return m
  }, [look, kind])
  const edge = useMemo(
    () => new MeshBasicMaterial({ color: look.glow, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [look],
  )
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({ x: ((i % 9) / 8 - 0.5) * width, h: Math.floor(i / 9), s: 0.8 + Math.random() * 0.6, p: Math.random() * 6 })), [width])
  const group = useRef(null)
  const flash = useRef(null)

  useFrame((state) => {
    const f = frontRef.current
    const g = group.current
    if (!g) return
    g.visible = f !== null
    if (f === null) return
    g.position.z = f
    // The camera trails the runner, so a close chaser would sit right in front
    // of the lens: fade it to a ghost while the camera is inside or behind it.
    const behind = state.camera.position.z - (f - 1)
    const fade = Math.min(1, Math.max(0, 1 - behind / 3))
    const mat = mesh.material
    mat.opacity = 0.16 + (mat.userData.full - 0.16) * fade
    mat.depthWrite = fade > 0.95
    edge.opacity = 0.12 + 0.43 * fade
    const t = glowClock.value
    seeds.forEach((sd, i) => {
      if (kind === 'laserwall') {
        _o.position.set(0, 0.6 + i * 0.5, 0)
        _o.rotation.set(0, 0, 0)
        _o.scale.set(i < 12 ? width + 2 : 0.001, 0.12, 0.12)
      } else {
        const wave = kind === 'wave'
        const r = (wave ? 3.6 : 2.8) * sd.s
        _o.position.set(sd.x, (wave ? 0.8 : 0.3) + sd.h * (wave ? 2.2 : 1.5) + Math.sin(t * 3 + sd.p) * 0.4, 1.6 + Math.sin(t * 2 + sd.p) * 0.8 + sd.h * (wave ? -1.2 : 1.2))
        _o.rotation.set(t * sd.s, t * 0.7, 0)
        _o.scale.setScalar(r)
      }
      _o.updateMatrix()
      mesh.setMatrixAt(i, _o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (flash.current) {
      // The storm throws lightning at the front.
      flash.current.visible = kind === 'storm' && Math.sin(t * 13) > 0.85
      flash.current.position.x = Math.sin(t * 7.3) * width * 0.4
    }
  })
  useEffect(() => () => mesh.material.dispose(), [mesh])

  return (
    <group ref={group} visible={false}>
      <primitive object={mesh} />
      <mesh material={edge} position={[0, 2.5, -0.2]}>
        <boxGeometry args={[width + 2, 5, 0.6]} />
      </mesh>
      <mesh ref={flash} visible={false} position={[0, 8, -1]}>
        <boxGeometry args={[0.5, 16, 0.5]} />
        <meshBasicMaterial color="#fff6a0" toneMapped={false} />
      </mesh>
    </group>
  )
}

/** The flooded / collapsed stretch behind the front. */
function Flood({ look, width, startZ, frontRef }) {
  const ref = useRef(null)
  const material = useMemo(() => (look.fluid ? fluidMaterial(look.fluid) : null), [look])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const f = frontRef.current
    m.visible = f !== null && f < startZ - 0.5
    if (!m.visible) return
    const len = startZ - f
    m.scale.set(width + 0.4, 1, len)
    m.position.set(0, 0.45, (startZ + f) / 2)
  })
  if (!material) return null
  return (
    <mesh ref={ref} material={material} rotation={[0, 0, 0]} visible={false}>
      <boxGeometry args={[1, 0.9, 1]} />
    </mesh>
  )
}

/** Collapsing bridge tiles: each drops away once the front passes it. */
function BridgeTiles({ z0, length, width, color, trim, frontRef }) {
  const TILE = 3
  const count = Math.ceil(length / TILE)
  const mesh = useMemo(() => {
    const m = new InstancedMesh(unitBox, new MeshLambertMaterial({ color }), count)
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    return m
  }, [count, color])
  const fallen = useMemo(() => new Float32Array(count), [count])
  useFrame((_s, dt) => {
    const f = frontRef.current
    for (let i = 0; i < count; i += 1) {
      const z = z0 - (i + 0.5) * TILE
      if (f !== null && f < z + TILE / 2) fallen[i] = Math.min(20, fallen[i] + dt * (2 + fallen[i] * 3))
      else if (f === null) fallen[i] = 0
      const drop = fallen[i]
      _o.position.set(0, -0.5 - drop * drop * 0.15, z)
      _o.rotation.set(drop * 0.08 * (i % 2 ? 1 : -1), 0, drop * 0.05)
      _o.scale.set(width, 1, TILE - 0.15)
      _o.updateMatrix()
      mesh.setMatrixAt(i, _o.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  useEffect(() => () => mesh.material.dispose(), [mesh])
  return (
    <>
      <primitive object={mesh} />
      {/* The walkable surface: one invisible slab (the tiles only look like they fall). */}
      <Block size={[width, 1, length]} pos={[0, -0.5, z0 - length / 2]} color={color} opacity={0.0001} />
      {[-1, 1].map((s) => (
        <Block key={s} size={[0.3, 0.9, length]} pos={[s * (width / 2 + 0.15), 0.5, z0 - length / 2]} color={trim} solid={false} />
      ))}
    </>
  )
}

export function TrialSeg({ seg, W, theme, n, eager }) {
  const step = useStaged(2, eager)
  const look = LOOKS[seg.chaser] || LOOKS.lava
  const startZ = seg.z0 - seg.startPad
  const endZ = startZ - seg.length
  const pathW = look.path === 'bridge' ? 7 : look.path === 'beach' ? W : Math.max(10, W * 0.7)
  const front = useRef(null)
  const state = useRef({ phase: 'idle', teleports: 0, hudAt: 0 })
  const name = TRIAL_NAMES[seg.chaser] || 'SPEED TRIAL'

  useEffect(
    () => () => {
      if (runtime.trial?.seg === seg) {
        runtime.trial = null
        useGame.setState({ trialHud: null, danger: false })
      }
    },
    [seg],
  )

  // A heads-up just before the trial starts.
  useZone(
    () => ({
      min: [-W / 2, -1, seg.z0 - 10],
      max: [W / 2, 8, seg.z0 - 4],
      onEnter: () => {
        if (runtime.dead) return
        useGame.getState().toast(`⚡ ${name} ahead! Need Level ${seg.level}`, { color: '#ffd23f', icon: '⚠️', ms: 2400 })
      },
    }),
    [seg],
  )

  useFrame((_s, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = state.current
    const p = runtime.playerPos
    if (runtime.teleports !== st.teleports) {
      st.teleports = runtime.teleports
      st.phase = 'idle'
      front.current = null
    }
    const inX = Math.abs(p.x) < pathW / 2 + 2
    if (st.phase === 'idle') {
      if (!runtime.dead && p.z < startZ && p.z > startZ - 6 && inX) {
        st.phase = 'run'
        front.current = startZ + seg.headStart
        runtime.trial = { seg }
        sfx.trialStart()
        const game = useGame.getState()
        useGame.setState({ danger: true })
        game.showBanner(`⚠ ${name}!`, `RUN! Level ${seg.level} speed needed`, '#ff5a5a')
      }
      return
    }
    if (st.phase === 'run') {
      front.current -= seg.speed * dt
      if (p.z < endZ) {
        st.phase = 'done'
        runtime.trial = null
        sfx.trialClear()
        runtime.celebrations += 1
        const game = useGame.getState()
        game.noteTrial(`${n}:${seg.index}`)
        useGame.setState({ danger: false, trialHud: null })
        game.showBanner('TRIAL CLEARED!', name, '#7affc8')
        return
      }
      if (!runtime.dead && front.current <= p.z + 0.6) {
        st.phase = 'caught'
        runtime.trial = null
        const game = useGame.getState()
        const need = seg.level
        const msg =
          game.level < need
            ? `Too slow! ${name} needs Level ${need} (you are Level ${game.level})`
            : game.adjust
              ? `Too slow! Set your speed back to max (${walkDisplay(game.level)})`
              : `Caught by the ${name.toLowerCase()}! Run straight and don't stop`
        useGame.setState({ trialHud: null })
        killPlayer('trial', msg)
        return
      }
      if (performance.now() - st.hudAt > 90) {
        st.hudAt = performance.now()
        useGame.setState({
          trialHud: { name, level: seg.level, progress: Math.min(1, Math.max(0, (startZ - p.z) / seg.length)), lead: front.current - p.z },
        })
      }
      return
    }
    if (st.phase === 'done') {
      // Let the hazard roll on to the end, then reset once the player is clear.
      if (front.current !== null) {
        front.current -= seg.speed * dt
        if (front.current < endZ) front.current = null
      }
      if (p.z > seg.z0 + 4 || p.z < seg.z1 - 60) st.phase = 'idle'
    }
    if (st.phase === 'caught' && !runtime.dead) {
      st.phase = 'idle'
      front.current = null
    }
  })

  const floor = theme.floor
  return (
    <>
      {/* Start pad with the trial arch. */}
      <Block size={[W, 6, seg.startPad]} pos={[0, -3, seg.z0 - seg.startPad / 2]} color={theme.floor2} pattern={theme.pattern} />
      {[-1, 1].map((s) => (
        <Block key={s} size={[1.6, 9, 1.6]} pos={[s * (pathW / 2 + 1.4), 4.5, startZ + 1]} color="#ff3a4a" emissive="#ff3a4a" emissiveIntensity={0.4} />
      ))}
      {step >= 1 && <Sign
        position={[0, 11, startZ + 1]}
        size={[Math.max(16, pathW + 6), 4.2]}
        options={{
          bg: '#1a0a0a',
          bg2: '#8a1a1a',
          border: '#ffd23f',
          borderWidth: 14,
          anime: { burst: '#ff3a3a' },
          lines: [
            { text: `⚡ ${name}`, size: 100, color: '#ffffff', stroke: '#000', strokeWidth: 12 },
            { text: `SPEED TRIAL · LEVEL ${seg.level}`, size: 60, color: '#ffe23a', stroke: '#000', strokeWidth: 8 },
          ],
        }}
      />}
      <Label3D position={[0, 7.4, startZ + 1]} height={1} bob={0.1} lines={[{ text: `Max speed ${walkDisplay(seg.level)} needed!`, size: 48, color: '#ffd8d8' }]} />

      {/* The run itself. */}
      {look.path === 'bridge' ? (
        <BridgeTiles z0={startZ} length={seg.length} width={pathW} color={floor} trim={theme.trim} frontRef={front} />
      ) : (
        <>
          <Block size={[pathW, 6, seg.length]} pos={[0, -3, startZ - seg.length / 2]} color={floor} pattern={theme.pattern} />
          {look.path === 'corridor' &&
            [-1, 1].map((s) => (
              <Block key={s} size={[1.4, 5, seg.length]} pos={[s * (pathW / 2 + 0.7), 2.5, startZ - seg.length / 2]} color={theme.wall} pattern="bricks" />
            ))}
          {/* Distance marks every 20m. */}
          {Array.from({ length: Math.floor(seg.length / 20) }, (_, k) => (
            <Block key={k} size={[pathW, 0.06, 0.6]} pos={[0, 0.03, startZ - (k + 1) * 20]} color="#ffffff" opacity={0.5} solid={false} shadow={false} />
          ))}
        </>
      )}

      {/* Finish line and safe pad. */}
      <Block size={[W, 6, seg.endPad]} pos={[0, -3, endZ - seg.endPad / 2]} color={theme.floor2} pattern={theme.pattern} />
      <Block size={[pathW + 2, 0.08, 1.4]} pos={[0, 0.04, endZ]} color="#7affc8" emissive="#7affc8" emissiveIntensity={0.9} solid={false} shadow={false} />
      <RisingSparks position={[0, 0, endZ - 2]} radius={pathW / 2} height={6} count={50} color="#7affc8" size={4} />
      <Label3D position={[0, 6, endZ - 1]} height={1.2} lines={[{ text: '✅ SAFE ZONE', size: 56, color: '#7affc8' }]} />

      <Flood look={look} width={pathW} startZ={startZ + seg.headStart} frontRef={front} />
      {look.path !== 'bridge' && <ChaserWall look={look} width={pathW} frontRef={front} kind={seg.chaser} />}
    </>
  )
}

export default TrialSeg
