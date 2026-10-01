import { CuboidCollider } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three'

import { STAGES, stageLevel } from '../config'
import { glowClock, RisingSparks } from '../fx/Glow'
import { sfx } from '../sfx'
import { useGame } from '../store'
import { useZone } from '../zones'
import { Block, Label3D, Sign } from './Primitives'

/**
 * The big gate into stage `n`, set into a castle wall that spans the whole
 * plaza (`facade` wide) so the only way on is through it. Below the stage's
 * level its force field is a solid red wall; once the level is reached it turns
 * into a swirling portal you run straight through.
 */

const FIELD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uLocked;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float a = atan(p.y, p.x);
    float r = length(p * vec2(1.0, 1.4));
    float swirl = sin(a * 6.0 + r * 30.0 - uTime * 5.0) * 0.5 + 0.5;
    float stripes = step(0.5, fract((vUv.x + vUv.y) * 9.0 - uTime * 0.8));
    float edge = smoothstep(0.38, 0.5, max(abs(p.x), abs(p.y)));
    float m = mix(swirl * 0.55 + 0.15, stripes * 0.45 + 0.25, uLocked) + edge * 0.6;
    gl_FragColor = vec4(uColor, m * 0.75);
  }
`
const FIELD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

function fieldMaterial(color, locked) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: glowClock, uLocked: { value: locked ? 1 : 0 } },
    vertexShader: FIELD_VERT,
    fragmentShader: FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

const H = 16
const PILLAR = 4.4
const WALL_H = 12
const WALL_D = 3

/** One stretch of castle wall with battlements, centred at x. */
function Wall({ x, z, width, theme }) {
  const merlons = Math.max(1, Math.floor(width / 3.2))
  return (
    <>
      <Block size={[width, WALL_H, WALL_D]} pos={[x, WALL_H / 2, z]} color={theme.wall} pattern="bricks" />
      <Block size={[width + 0.2, 0.7, WALL_D + 0.3]} pos={[x, WALL_H * 0.62, z]} color={theme.trim} solid={false} />
      {Array.from({ length: merlons }, (_, i) => (
        <Block
          key={i}
          size={[1.6, 1.6, WALL_D]}
          pos={[x - width / 2 + (i + 0.5) * (width / merlons), WALL_H + 0.8, z]}
          color={theme.wall}
          pattern="bricks"
          solid={false}
        />
      ))}
    </>
  )
}

export function Gate({ n, z, width, facade, theme }) {
  const need = stageLevel(n)
  const locked = useGame((s) => s.level < need)
  const color = locked ? '#ff3a4a' : '#3af0ff'
  const material = useMemo(() => fieldMaterial(color, locked), [color, locked])
  const lastWarn = useRef(0)
  const half = width / 2
  const outer = half + PILLAR
  const sideW = Math.max(0, facade / 2 - outer)

  // Warn when walking into a locked gate.
  useZone(
    () => ({
      min: [-half, -1, z],
      max: [half, H, z + 4],
      onEnter: () => {
        if (useGame.getState().level >= need) return
        const now = performance.now()
        if (now - lastWarn.current < 1500) return
        lastWarn.current = now
        sfx.deny()
        useGame.getState().toast(`🔒 Stage ${n} needs Level ${need}! Keep training`, { color: '#ff7a7a', icon: '⚡', ms: 3000 })
      },
    }),
    [n, z, width],
  )

  // Passing through an open gate: the stage begins.
  useZone(
    () => ({
      min: [-half, -1, z - 6],
      max: [half, H, z - 1.5],
      onEnter: () => {
        const game = useGame.getState()
        if (game.level < need) return
        sfx.gate()
        game.noteStageReached(n)
        game.showBanner(`STAGE ${n}`, `${STAGES[n - 1].name} · ${STAGES[n - 1].jp}`, theme.accent)
      },
    }),
    [n, z, width],
  )

  return (
    <group>
      {/* Pillars, with glowing braziers on top. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block size={[PILLAR, H, PILLAR]} pos={[s * (half + PILLAR / 2), H / 2, z]} color={theme.trim} pattern="bricks" />
          <Block size={[PILLAR + 1.2, 1.4, PILLAR + 1.2]} pos={[s * (half + PILLAR / 2), 0.7, z]} color="#2a2a34" solid={false} />
          <Block size={[PILLAR + 1.2, 1.2, PILLAR + 1.2]} pos={[s * (half + PILLAR / 2), H + 0.2, z]} color="#2a2a34" solid={false} />
          <Block size={[1.8, 1.2, 1.8]} pos={[s * (half + PILLAR / 2), H + 1.4, z]} color={theme.accent} emissive={theme.accent} emissiveIntensity={1.2} solid={false} shadow={false} />
          <RisingSparks position={[s * (half + PILLAR / 2), H + 1.6, z]} radius={1} height={4} count={18} color={theme.accent} size={3} speed={0.8} />
          {sideW > 0.5 && <Wall x={s * (outer + sideW / 2)} z={z} width={sideW} theme={theme} />}
        </group>
      ))}
      {/* Lintel, torii style. */}
      <Block size={[width + PILLAR * 2 + 6, 1.8, 3.6]} pos={[0, H + 2.6, z]} color="#1a1a22" solid={false} />
      <Block size={[width + PILLAR * 2 + 3, 1, 3]} pos={[0, H - 1, z]} color={theme.trim} solid={false} />

      {/* Force field. */}
      <mesh position={[0, (H - 1.5) / 2, z]} material={material} renderOrder={7}>
        <planeGeometry args={[width + 0.2, H - 1.5]} />
      </mesh>
      {locked && <CuboidCollider args={[half, H / 2, 0.5]} position={[0, H / 2, z]} />}
      <RisingSparks position={[0, 0, z]} radius={half * 0.9} height={H - 2} count={60} color={color} size={4} />

      <Sign
        position={[0, H + 7.6, z + 0.4]}
        size={[Math.min(40, width + 14), 8]}
        options={{
          bg: locked ? '#3a0a14' : '#0a2a4a',
          bg2: locked ? '#8a1a2a' : '#1a6aff',
          border: theme.accent,
          borderWidth: 18,
          anime: { burst: locked ? '#ff3a4a' : theme.accent },
          lines: [
            { text: `STAGE ${n}`, size: 170, color: '#ffffff', stroke: '#000', strokeWidth: 18 },
            { text: STAGES[n - 1].name, size: 80, color: '#ffe23a', stroke: '#000', strokeWidth: 10 },
          ],
        }}
      />
      <Label3D
        position={[0, H * 0.5, z + 1.2]}
        height={1.9}
        bob={locked ? 0.15 : 0}
        lines={[{ text: locked ? `🔒 LEVEL ${need} REQUIRED` : `✅ LEVEL ${need}`, size: 60, color: locked ? '#ff6a7a' : '#7affc8' }]}
      />
    </group>
  )
}

export default Gate
