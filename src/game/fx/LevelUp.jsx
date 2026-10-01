import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
} from 'three'

import { characterById } from '../config'
import { runtime } from '../runtime'
import { useGame } from '../store'
import { glowClock } from './Glow'

/**
 * The level-up show, for you and for everyone who sees you do it:
 *   - two shockwave rings racing out across the ground
 *   - a thin shaft of light with a flickering core
 *   - strands of glowing sparks spiralling up round the character
 *   - a four-point star flaring at the head
 * Up to four play at once. Bursts are queued in `runtime.bursts` (the local
 * player's own on every level up, another player's when their level rises).
 */

const POOL = 4
const LIFE = 2.2
const SPARKS = 90

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAge;
  uniform float uDelay;
  varying vec2 vUv;
  void main() {
    float a = max(0.0, uAge - uDelay);
    float life = clamp(a / 1.2, 0.0, 1.0);
    float radius = 1.0 - pow(1.0 - life, 3.0);
    float r = length(vUv - 0.5) * 2.0;
    float w = 0.05 + 0.1 * (1.0 - life);
    float ring = smoothstep(w, 0.0, abs(r - radius * 0.95));
    float inner = smoothstep(radius, 0.0, r) * 0.25 * (1.0 - life);
    float alpha = (ring + inner) * (1.0 - life) * step(0.0001, a);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), ring * 0.6), alpha);
  }
`
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAge;
  varying vec2 vUv;
  void main() {
    float env = smoothstep(0.0, 0.12, uAge) * (1.0 - smoothstep(0.7, 1.7, uAge));
    float fade = pow(1.0 - vUv.y, 1.3) * smoothstep(0.0, 0.05, vUv.y);
    float flick = 0.8 + 0.2 * sin(vUv.y * 40.0 - uAge * 30.0);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35), fade * flick * env * 0.5);
  }
`
const SPARK_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aAngle;
  attribute float aDir;
  uniform float uAge;
  varying float vA;
  varying float vSeed;
  void main() {
    float p = clamp((uAge - aSeed * 0.5) / 1.5, 0.0, 1.0);
    float ang = aAngle + p * 10.0 * aDir;
    float rad = (1.5 - p * 0.9) * (0.55 + aSeed * 0.45);
    vec3 pos = vec3(cos(ang) * rad, 0.1 + p * (3.5 + aSeed * 3.0), sin(ang) * rad);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.0 - p * 0.5) * (2.6 + aSeed * 2.2) * 38.0 / max(1.0, -mv.z);
    vA = sin(p * 3.14159) * step(0.001, p) * step(p, 0.999);
    vSeed = aSeed;
  }
`
const SPARK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float s = max(0.0, 1.0 - d * 2.0);
    s += max(0.0, 1.0 - abs(c.x) * 12.0) * max(0.0, 1.0 - abs(c.y) * 2.0) * 0.8;
    s += max(0.0, 1.0 - abs(c.y) * 12.0) * max(0.0, 1.0 - abs(c.x) * 2.0) * 0.8;
    vec3 col = mix(uColor, vec3(1.0), 0.35 + 0.4 * vSeed);
    gl_FragColor = vec4(col, s * vA);
  }
`

let starTexture = null
function getStar() {
  if (starTexture) return starTexture
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.translate(64, 64)
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 56)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(-64, -64, 128, 128)
  ctx.fillStyle = '#fff'
  for (const [w, h] of [[7, 62], [62, 7]]) {
    ctx.beginPath()
    ctx.moveTo(0, -h)
    ctx.quadraticCurveTo(w * 0.2, -w * 0.2, w, 0)
    ctx.quadraticCurveTo(w * 0.2, w * 0.2, 0, h)
    ctx.quadraticCurveTo(-w * 0.2, w * 0.2, -w, 0)
    ctx.quadraticCurveTo(-w * 0.2, -w * 0.2, 0, -h)
    ctx.fill()
  }
  starTexture = new CanvasTexture(c)
  return starTexture
}

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false, fog: false }

/** Everything one burst is made of, built once and reused. */
function buildBurst() {
  const color = { value: new Color('#ffe23a') }
  const age = { value: 0 }
  const ring = (delay) =>
    new ShaderMaterial({ uniforms: { uColor: color, uAge: age, uDelay: { value: delay } }, vertexShader: QUAD_VERT, fragmentShader: RING_FRAG, ...additive })
  const beam = new ShaderMaterial({ uniforms: { uColor: color, uAge: age }, vertexShader: QUAD_VERT, fragmentShader: BEAM_FRAG, ...additive })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(SPARKS * 3), 3))
  const seed = new Float32Array(SPARKS)
  const angle = new Float32Array(SPARKS)
  const dir = new Float32Array(SPARKS)
  for (let i = 0; i < SPARKS; i += 1) {
    seed[i] = Math.random()
    // Three strands, winding both ways.
    angle[i] = (i % 3) * ((Math.PI * 2) / 3) + Math.random() * 0.5
    dir[i] = i % 2 ? 1 : -1
  }
  geometry.setAttribute('aSeed', new BufferAttribute(seed, 1))
  geometry.setAttribute('aAngle', new BufferAttribute(angle, 1))
  geometry.setAttribute('aDir', new BufferAttribute(dir, 1))
  const sparks = new ShaderMaterial({ uniforms: { uColor: color, uAge: age }, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, ...additive })

  const star = new Sprite(new SpriteMaterial({ map: getStar(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false }))
  star.position.set(0, 2.3, 0)
  star.renderOrder = 12

  return { color, age, ring1: ring(0), ring2: ring(0.18), beam, sparks, geometry, star, group: new Group(), start: -100, active: false }
}

const _c = new Color()

export function LevelUpBursts() {
  const bursts = useMemo(() => Array.from({ length: POOL }, buildBurst), [])
  const next = useRef(0)
  const seenLevelUps = useRef(runtime.levelUps)

  useFrame(() => {
    const now = glowClock.value
    // Your own level up joins the queue.
    if (runtime.levelUps !== seenLevelUps.current) {
      seenLevelUps.current = runtime.levelUps
      const p = runtime.playerPos
      const char = characterById(useGame.getState().equipped)
      runtime.bursts.push({ x: p.x, y: p.y - 0.9, z: p.z, color: char.aura?.color || '#ffe23a' })
    }
    while (runtime.bursts.length) {
      const b = runtime.bursts.shift()
      const slot = bursts[next.current]
      next.current = (next.current + 1) % POOL
      slot.group.position.set(b.x, b.y, b.z)
      slot.color.value.copy(_c.set(b.color))
      slot.start = now
      slot.active = true
      slot.group.visible = true
    }
    for (const slot of bursts) {
      if (!slot.active) continue
      const age = now - slot.start
      if (age > LIFE) {
        slot.active = false
        slot.group.visible = false
        continue
      }
      slot.age.value = age
      // The star pops, hangs, and fades.
      const pop = age < 0.25 ? age / 0.25 : 1
      const size = (0.4 + 4.4 * Math.sin(Math.min(1, age / 1.4) * Math.PI) ** 0.6) * pop
      slot.star.scale.set(size, size, 1)
      slot.star.material.rotation = age * 1.5
      slot.star.material.opacity = Math.max(0, 1 - age / 1.5)
      slot.star.material.color.copy(slot.color.value).lerp(_c.set('#ffffff'), 0.5)
    }
  })

  return (
    <>
      {bursts.map((b, i) => (
        <primitive key={i} object={b.group} visible={false}>
          <mesh material={b.ring1} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} scale={[16, 16, 1]} renderOrder={9}>
            <planeGeometry args={[1, 1]} />
          </mesh>
          <mesh material={b.ring2} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} scale={[10, 10, 1]} renderOrder={9}>
            <planeGeometry args={[1, 1]} />
          </mesh>
          <mesh material={b.beam} position={[0, 7, 0]} renderOrder={9}>
            <cylinderGeometry args={[0.28, 0.5, 14, 16, 1, true]} />
          </mesh>
          <points geometry={b.geometry} material={b.sparks} frustumCulled={false} renderOrder={10} />
          <primitive object={b.star} />
        </primitive>
      ))}
    </>
  )
}

export default LevelUpBursts
