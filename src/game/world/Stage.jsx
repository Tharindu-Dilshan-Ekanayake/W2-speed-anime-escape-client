import { RigidBody } from '@react-three/rapier'
import { memo, useEffect, useMemo, useState } from 'react'

import { FLUID_Y, premiumPadCost, premiumPadMult, STAGE_COUNT, STAGES } from '../config'
import { GlowColumn, RisingSparks, RuneRing } from '../fx/Glow'
import { PLAZA_SIDE, stageLayout } from '../layout'
import { useGame } from '../store'
import { themeOf } from '../themes'
import { StaticBatch } from './batch'
import { Fluid } from './Fluid'
import { Gate } from './Gate'
import { Treadmill, WinPad } from './Pads'
import { useStaged } from './useStaged'
import { Block, Label3D, Sign } from './Primitives'
import Scenery from './Scenery'
import {
  BouldersSeg,
  ClimbSeg,
  ZigzagSeg,
  CrushersSeg,
  GapsSeg,
  LasersSeg,
  MoversSeg,
  NarrowSeg,
  PillarsSeg,
  RunSeg,
  SpinnersSeg,
  StonesSeg,
} from './Segments'
import { TrialSeg } from './Trial'

/**
 * One whole stage: gate, obstacle segments, speed trials, the finish with its
 * win pads and training pads, the fluid underneath and the scenery around.
 * Only the stage the player is in and its neighbours are mounted (World.jsx).
 */

/** The entry just behind the gate (the gate itself stands at the end of the previous stage). */
function StartSeg({ seg, W, theme }) {
  const mid = (seg.z0 + seg.z1) / 2
  return (
    <>
      <Block size={[W, 6, seg.len]} pos={[0, -3, mid]} color={theme.floor2} pattern={theme.pattern} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block size={[1.2, 3.2, 1.2]} pos={[s * (W / 2 - 1.5), 1.6, seg.z0 - 10]} color="#2a2a34" solid={false} />
          <Block size={[1.4, 1, 1.4]} pos={[s * (W / 2 - 1.5), 3.6, seg.z0 - 10]} color={theme.accent} emissive={theme.accent} emissiveIntensity={1} solid={false} shadow={false} />
        </group>
      ))}
    </>
  )
}

function PremiumPad({ n, pos }) {
  const owned = useGame((s) => s.ownedPads.includes(n))
  const mult = premiumPadMult(n)
  return (
    <Treadmill
      pos={pos}
      mult={mult}
      color="#ffc21f"
      accent="#fff07a"
      fx="fire"
      cost={premiumPadCost(n)}
      owned={owned}
      isOwned={() => useGame.getState().ownedPads.includes(n)}
      onBuy={() => useGame.getState().buyPad(n)}
      label={`x${mult} TRAINING`}
      face={-1}
    />
  )
}

/**
 * The stage's end: a wide plaza with the win pads on the left and the training
 * pads on the right - well clear of the path down the middle - in front of the
 * castle wall that holds the next stage's gate.
 */
function FinishSeg({ seg, n, W, theme, eager }) {
  const step = useStaged(3, eager)
  const mid = (seg.z0 + seg.z1) / 2
  const PW = seg.plazaW
  const gateZ = seg.z0 + seg.gateZ
  const padZ = seg.z0 + seg.padZ
  const last = n === STAGE_COUNT
  const nextTheme = last ? theme : themeOf(STAGES[n].theme)
  const lx = W / 2 + 6
  const rx = W / 2 + 15
  return (
    <>
      {/* Plaza floor, with the path marked down the middle. */}
      <Block size={[PW, 6, seg.len]} pos={[0, -3, mid]} color={theme.floor} pattern={theme.pattern} />
      <Block size={[W, 0.06, seg.len - 4]} pos={[0, 0.03, mid - 2]} color={theme.floor2} pattern={theme.pattern} solid={false} shadow={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block size={[0.4, 0.12, seg.len - 4]} pos={[s * (W / 2 + 0.2), 0.06, mid - 2]} color={theme.accent} emissive={theme.accent} emissiveIntensity={0.9} solid={false} shadow={false} />
          {/* Side walls joining the gate wall. */}
          <Block size={[2, 6, seg.len]} pos={[s * (PW / 2 + 1), 3, mid]} color={nextTheme.wall} pattern="bricks" />
          <Block size={[2.4, 0.6, seg.len]} pos={[s * (PW / 2 + 1), 6.3, mid]} color={nextTheme.trim} solid={false} />
        </group>
      ))}
      <Block size={[W, 0.1, 1.2]} pos={[0, 0.05, seg.z0 - 1]} color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} solid={false} shadow={false} />
      {step >= 1 && <Sign
        position={[0, 9, seg.z0 - 6]}
        size={[Math.min(28, W), 4.4]}
        options={{
          bg: '#0a3a1a',
          bg2: '#1aa84a',
          border: '#ffd23f',
          borderWidth: 14,
          anime: { burst: '#ffd23f' },
          lines: [
            { text: last ? '🏆 YOU ESCAPED! 🏆' : `STAGE ${n} CLEAR!`, size: 110, color: '#ffffff', stroke: '#000', strokeWidth: 12 },
            { text: last ? 'The Demon King is defeated!' : 'Grab your Wins - or go on through the gate!', size: 50, color: '#ffe23a', stroke: '#000', strokeWidth: 7 },
          ],
        }}
      />}

      {/* Win pads (left) and training pads (right), beside the gate. */}
      {step >= 1 && <>
      <WinPad pos={[-lx, 0.06, padZ]} n={n} />
      <WinPad pos={[-rx, 0.06, padZ]} n={n} double />
      <Treadmill pos={[lx, 0, padZ]} mult={1} color="#4fb8ff" accent="#bfe8ff" owned isOwned={() => true} label="x1 TRAINING" face={-1} />
      <PremiumPad n={n} pos={[rx, 0, padZ]} />
      <Label3D position={[-(lx + rx) / 2, 8.2, padZ]} height={1.3} bob={0.1} lines={[{ text: '🏆 WIN PADS', size: 60, color: '#ffd23f' }]} />
      <Label3D position={[(lx + rx) / 2, 8.2, padZ]} height={1.3} bob={0.1} lines={[{ text: '⚡ TRAINING PADS', size: 60, color: '#7ad8ff' }]} />
      </>}

      {step < 2 ? null : last ? (
        <>
          <Block size={[PW + 4, 14, 3]} pos={[0, 7, gateZ]} color={theme.wall} pattern="bricks" />
          <Block size={[6, 2, 6]} pos={[0, 1, gateZ + 10]} color="#ffd700" emissive="#ffb000" emissiveIntensity={0.4} />
          <Block size={[2, 4, 2]} pos={[0, 4, gateZ + 10]} color="#ffd700" emissive="#ffb000" emissiveIntensity={0.4} solid={false} />
          <Block size={[7, 5, 7]} pos={[0, 8.5, gateZ + 10]} color="#ffd700" emissive="#ffb000" emissiveIntensity={0.5} solid={false} />
          <GlowColumn position={[0, 0, gateZ + 10]} radius={6} height={30} color="#ffd700" opacity={0.5} />
          <RisingSparks position={[0, 0, gateZ + 10]} radius={6} height={24} count={80} color="#ffe23a" size={5} rainbow />
          <RuneRing position={[0, 0.05, gateZ + 10]} radius={9} color="#ffd700" rainbow />
        </>
      ) : (
        <Gate n={n + 1} z={gateZ} width={W} facade={PW + 4} theme={nextTheme} />
      )}
    </>
  )
}

const SEGMENTS = {
  run: RunSeg,
  gaps: GapsSeg,
  stones: StonesSeg,
  spinners: SpinnersSeg,
  movers: MoversSeg,
  boulders: BouldersSeg,
  lasers: LasersSeg,
  crushers: CrushersSeg,
  narrow: NarrowSeg,
  pillars: PillarsSeg,
  zigzag: ZigzagSeg,
  climb: ClimbSeg,
}

/** Delay between two pieces of a stage being mounted ahead of time (ms). */
const MOUNT_STEP_MS = 55

/**
 * One whole stage. The stage the player is in mounts at once; a stage mounted
 * ahead of them (the next / previous one) is built one piece at a time - each
 * obstacle segment, then the scenery - so walking into it never causes a hitch.
 * Every piece has its own static batch, so adding one only re-merges that piece.
 */
export const Stage = memo(function Stage({ n, eager, leaving, onGone }) {
  const stage = stageLayout(n)
  const theme = themeOf(stage.meta.theme)
  const { W } = stage

  // Items in build order: the fluid, each segment, then the scenery.
  const SCENERY_CHUNKS = 3
  const total = stage.segs.length + 1 + SCENERY_CHUNKS
  // The stage the player arrives in is complete at once; the others fill in a
  // piece at a time, and empty out the same way once the player has moved on.
  const [built, setBuilt] = useState(eager ? total : 0)
  useEffect(() => {
    if (leaving) {
      if (built <= 0) {
        onGone?.()
        return undefined
      }
      const id = setTimeout(() => setBuilt((c) => c - 1), MOUNT_STEP_MS)
      return () => clearTimeout(id)
    }
    if (eager || built >= total) return undefined
    const id = setTimeout(() => setBuilt((c) => c + 1), MOUNT_STEP_MS)
    return () => clearTimeout(id)
  }, [eager, leaving, built, total, onGone])
  const count = eager && !leaving ? total : built
  const [mountedEager] = useState(eager)

  // Built once per step: when the player walks in and `eager` flips, the pieces
  // are the very same elements, so React skips re-rendering the whole stage.
  const pieces = useMemo(() => {
    const pieces = []
    if (count >= 1) pieces.push(<Fluid key="fluid" kind={theme.fluid} area={[-420, 420, stage.z1 - 4, stage.z0 + 4]} y={FLUID_Y} />)
    stage.segs.forEach((seg, i) => {
      if (count < i + 2) return
      if (seg.kind === 'movers') {
        // Moving platforms are their own kinematic bodies.
        pieces.push(<MoversSeg key={i} seg={seg} n={n} W={W} theme={theme} i={i} />)
        return
      }
      let node
      if (seg.kind === 'start') node = <StartSeg seg={seg} W={W} theme={theme} />
      else if (seg.kind === 'finish') node = <FinishSeg seg={seg} n={n} W={W} theme={theme} eager={mountedEager} />
      else if (seg.kind === 'trial') node = <TrialSeg seg={seg} n={n} W={W} theme={theme} eager={mountedEager} />
      else {
        const Seg = SEGMENTS[seg.kind]
        node = Seg ? <Seg seg={seg} n={n} W={W} theme={theme} i={i} /> : null
      }
      pieces.push(
        <StaticBatch key={i}>
          <RigidBody type="fixed" colliders={false}>
            {node}
          </RigidBody>
        </StaticBatch>,
      )
    })
    // The scenery goes in over several pieces, each covering a third of the stage.
    for (let k = 0; k < SCENERY_CHUNKS; k += 1) {
      if (count < stage.segs.length + 2 + k) break
      const za = stage.z0 - (stage.len * k) / SCENERY_CHUNKS
      const zb = stage.z0 - (stage.len * (k + 1)) / SCENERY_CHUNKS
      pieces.push(<Scenery key={`scenery${k}`} theme={theme} z0={za} z1={zb} width={W + PLAZA_SIDE * 2 + 4} seed={n * 31 + 7 + k * 101} />)
    }

    return pieces
  }, [count, stage, theme, n, W, mountedEager])
  return <group>{pieces}</group>
})

export default Stage
