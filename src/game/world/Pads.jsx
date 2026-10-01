import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { MeshLambertMaterial, RepeatWrapping } from 'three'

import { TWO_X_WINS_REQUIREMENT, stageWins, rebirthWinsMult } from '../config'
import { abbreviate } from '../format'
import { GlowColumn, RisingSparks, RuneRing } from '../fx/Glow'
import { claimStageWins } from '../gameplay'
import { runtime } from '../runtime'
import { useGame } from '../store'
import { patternTexture } from '../textures'
import { useZone } from '../zones'
import { Block, Label3D } from './Primitives'

/**
 * Treadmills / training pads (stand on one to gain Speed without moving) and the
 * win pads at the end of every stage.
 */

const FX_COLOURS = { sparkle: null, fire: '#ff8a1f', electric: '#4ff0ff', aura: '#a46bff', rainbow: '#ffffff' }

/** One scrolling belt material shared by every treadmill. */
let beltMaterial = null
function getBeltMaterial() {
  if (beltMaterial) return beltMaterial
  const texture = patternTexture('belt').clone()
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1, 3)
  texture.needsUpdate = true
  beltMaterial = new MeshLambertMaterial({ map: texture, color: '#ffffff' })
  return beltMaterial
}

/** Scrolls the belts. Render once. */
export function BeltDriver() {
  useFrame((_s, dt) => {
    if (beltMaterial) beltMaterial.map.offset.y -= dt * 1.6
  })
  return null
}

/**
 * A treadmill along Z. The runner faces `face` (+1 = +Z, -1 = -Z).
 * `isOwned()` is read live; `onBuy()` unlocks it.
 */
export function Treadmill({ pos, mult, color, accent, fx = 'sparkle', rainbow = false, cost = 0, owned, isOwned, onBuy, face = 1, label }) {
  const [x, y, z] = pos
  const W = 3.8
  const L = 7.2
  const glow = FX_COLOURS[fx] || accent
  const belt = useMemo(() => getBeltMaterial(), [])

  useZone(
    () => ({
      min: [x - W / 2, y - 0.5, z - L / 2],
      max: [x + W / 2, y + 2.5, z + L / 2],
      onEnter: () => {
        runtime.treadmill = { mult, isOwned, face, x, z }
      },
      onExit: () => {
        if (runtime.treadmill?.x === x && runtime.treadmill?.z === z) runtime.treadmill = null
      },
      prompt: () => (isOwned() ? null : { text: label ? `Unlock ${label}` : `Unlock x${mult} Treadmill`, cost, color }),
      action: onBuy,
    }),
    [x, y, z, mult, cost],
  )

  const front = z + (face * L) / 2
  return (
    <group>
      {/* Base and belt, nearly flush with the floor so you can walk on. */}
      <Block size={[W + 0.8, 0.14, L + 0.4]} pos={[x, y + 0.02, z]} color="#2a2a36" />
      <mesh material={belt} position={[x, y + 0.1, z]} scale={[W - 0.2, 0.04, L]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* Side rails glowing in the treadmill's colour. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block size={[0.4, 0.45, L + 0.4]} pos={[x + s * (W / 2 + 0.2), y + 0.25, z]} color={color} solid={false} />
          <Block size={[0.12, 0.08, L + 0.4]} pos={[x + s * (W / 2 + 0.2), y + 0.5, z]} color={accent} basic solid={false} shadow={false} />
          <Block size={[0.25, 1.5, 0.25]} pos={[x + s * (W / 2 + 0.15), y + 0.9, front - face * 0.4]} color="#3a3a46" solid={false} />
        </group>
      ))}
      {/* Handlebar and console screen. */}
      <Block size={[W + 0.5, 0.2, 0.2]} pos={[x, y + 1.6, front - face * 0.4]} color="#3a3a46" solid={false} />
      <Block size={[2.2, 1.2, 0.3]} pos={[x, y + 1.9, front - face * 0.2]} color="#1a1a24" solid={false} />
      <Block size={[1.9, 0.9, 0.05]} pos={[x, y + 1.95, front - face * 0.37]} color={owned ? glow || color : '#555566'} basic solid={false} shadow={false} />

      <GlowColumn position={[x, y, z]} radius={2} height={owned ? 6 : 2.5} color={glow || color} opacity={owned ? 0.55 : 0.18} rainbow={rainbow} square />
      {owned && <RisingSparks position={[x, y, z]} radius={1.8} height={6} count={36} color={glow || accent} rainbow={rainbow} speed={fx === 'fire' ? 0.7 : 0.4} />}
      {owned && <RuneRing position={[x, y + 0.08, z]} radius={2.2} color={glow || color} rainbow={rainbow} spin={0.8} opacity={0.55} />}

      <Label3D
        position={[x, y + 4.4, front]}
        height={1.3}
        bob={0.12}
        lines={[{ text: label || `x${mult} SPEED`, size: 64, color: rainbow ? '#ffffff' : color, gradient: rainbow ? ['#ff5a5a', '#ffe23a', '#39d353', '#1fb8ff', '#c47bff'] : undefined }]}
      />
      {!owned && (
        <Label3D position={[x, y + 3.2, front]} height={0.8} lines={[{ text: cost > 0 ? `🔒 ${abbreviate(cost)} Wins` : 'FREE', size: 48, color: '#ffd23f' }]} />
      )}
    </group>
  )
}

/** Win pad. `double` = the green 2x pad, which needs TWO_X_WINS_REQUIREMENT Wins owned. */
export function WinPad({ pos, n, double = false }) {
  const [x, y, z] = pos
  const rebirths = useGame((s) => s.rebirths)
  const wins = useGame((s) => s.wins)
  const locked = double && wins < TWO_X_WINS_REQUIREMENT
  const amount = Math.round(stageWins(n) * (double ? 2 : 1) * rebirthWinsMult(rebirths))
  const color = double ? '#39e05a' : '#ffd23f'

  useZone(
    () => ({
      min: [x - 2.6, y - 0.5, z - 2.6],
      max: [x + 2.6, y + 2.5, z + 2.6],
      onEnter: () => claimStageWins(n, double),
    }),
    [x, y, z, n, double],
  )

  return (
    <group>
      <Block size={[5.6, 0.3, 5.6]} pos={[x, y - 0.05, z]} color="#ffffff" pattern="studs" />
      <Block size={[5, 0.12, 5]} pos={[x, y + 0.12, z]} color={color} emissive={color} emissiveIntensity={locked ? 0.15 : 0.7} solid={false} />
      <GlowColumn position={[x, y, z]} radius={2.6} height={locked ? 2 : 7} color={color} opacity={locked ? 0.15 : 0.5} square />
      {!locked && <RisingSparks position={[x, y, z]} radius={2.3} height={7} count={40} color={color} size={4} />}
      <RuneRing position={[x, y + 0.18, z]} radius={2.6} color={color} opacity={locked ? 0.2 : 0.8} />
      <Label3D
        position={[x, y + 4.6, z]}
        height={1.4}
        bob={0.15}
        lines={[{ text: `🏆 +${abbreviate(amount)} ${amount === 1 ? 'Win' : 'Wins'}`, size: 64, color }]}
      />
      <Label3D
        position={[x, y + 3.3, z]}
        height={0.8}
        lines={[{ text: double ? (locked ? `🔒 Own ${abbreviate(TWO_X_WINS_REQUIREMENT)} Wins` : '2X WINS!') : 'FREE', size: 44, color: locked ? '#ff8a8a' : '#ffffff' }]}
      />
    </group>
  )
}
