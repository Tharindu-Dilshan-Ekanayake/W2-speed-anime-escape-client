import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  ShaderMaterial,
} from 'three'

/**
 * Small reusable glow effects for pads, gates and treadmills: a column of light,
 * sparks rising through it, and a spinning rune ring on the floor. All additive,
 * all shader-driven (one draw call each, no per-frame JS work beyond a clock).
 */

const shared = { time: { value: 0 } }

/** Keeps the shared clock ticking. Render once in the scene. */
export function GlowClock() {
  // Wall-clock time (not a canvas's own clock), so a second canvas - the shop
  // preview - can run its own GlowClock without the two fighting.
  useFrame(() => {
    shared.time.value = performance.now() / 1000
  })
  return null
}

const COLUMN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const COLUMN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uRainbow;
  varying vec2 vUv;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    float fade = pow(1.0 - vUv.y, 1.6);
    float bands = 0.75 + 0.25 * sin(vUv.y * 18.0 - uTime * 4.0 + vUv.x * 6.2831 * 2.0);
    vec3 c = mix(uColor, hue(fract(vUv.y * 0.6 - uTime * 0.25 + vUv.x)), uRainbow);
    gl_FragColor = vec4(c, fade * bands * uOpacity);
  }
`

function columnMaterial(color, opacity, rainbow) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: shared.time, uOpacity: { value: opacity }, uRainbow: { value: rainbow ? 1 : 0 } },
    vertexShader: COLUMN_VERT,
    fragmentShader: COLUMN_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  })
}

/** An open cylinder of light rising from `position`. */
export function GlowColumn({ position, radius = 1.5, height = 4, color = '#ffffff', opacity = 0.7, rainbow = false, square = false }) {
  const material = useMemo(() => columnMaterial(color, opacity, rainbow), [color, opacity, rainbow])
  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]} material={material} renderOrder={7}>
      <cylinderGeometry args={[radius, radius, height, square ? 4 : 24, 1, true, square ? Math.PI / 4 : 0]} />
    </mesh>
  )
}

const SPARK_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uSize;
  varying float vA;
  varying float vSeed;
  void main() {
    float t = fract(aSeed * 7.13 + uTime * uSpeed * (0.6 + fract(aSeed * 3.7) * 0.8));
    vec3 p = position;
    p.y = t * uHeight;
    p.x += sin(uTime * 2.0 + aSeed * 20.0) * 0.15;
    p.z += cos(uTime * 1.7 + aSeed * 20.0) * 0.15;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 - t * 0.6) * 40.0 / max(0.5, -mv.z);
    vA = smoothstep(0.0, 0.1, t) * (1.0 - t);
    vSeed = aSeed;
  }
`
const SPARK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRainbow;
  uniform float uTime;
  varying float vA;
  varying float vSeed;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float star = max(0.0, 1.0 - d * 2.0);
    star += max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2) * 0.6;
    star += max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2) * 0.6;
    vec3 col = mix(uColor, hue(fract(vSeed + uTime * 0.2)), uRainbow);
    gl_FragColor = vec4(col, star * vA);
  }
`

/** Sparks drifting up inside a radius. */
export function RisingSparks({ position, radius = 1.4, height = 4, count = 40, color = '#ffffff', size = 3, speed = 0.4, rainbow = false }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * radius
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 2] = Math.sin(a) * r
      seed[i] = Math.random()
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    return g
  }, [count, radius])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: shared.time,
          uHeight: { value: height },
          uSpeed: { value: speed },
          uSize: { value: size },
          uColor: { value: new Color(color) },
          uRainbow: { value: rainbow ? 1 : 0 },
        },
        vertexShader: SPARK_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [height, speed, size, color, rainbow],
  )
  return <points position={position} geometry={geometry} material={material} frustumCulled={false} renderOrder={8} />
}

// ---------------------------------------------------------------------------
// Rune ring: a magic circle on the floor.
// ---------------------------------------------------------------------------

let runeTexture = null
export function getRuneTexture() {
  if (runeTexture) return runeTexture
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.arc(c, c, 236, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(c, c, 200, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c, c, 120, 0, Math.PI * 2)
  ctx.stroke()
  // Two overlapping triangles (a hexagram).
  for (const rot of [0, Math.PI]) {
    ctx.beginPath()
    for (let i = 0; i < 3; i += 1) {
      const a = rot + (i / 3) * Math.PI * 2 - Math.PI / 2
      const x = c + Math.cos(a) * 196
      const y = c + Math.sin(a) * 196
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
  }
  // Rune ticks round the band.
  ctx.font = 'bold 26px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const glyphs = '速走風火雷光闇氷星力夢龍'
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2
    ctx.save()
    ctx.translate(c + Math.cos(a) * 218, c + Math.sin(a) * 218)
    ctx.rotate(a + Math.PI / 2)
    ctx.fillText(glyphs[i % glyphs.length], 0, 0)
    ctx.restore()
  }
  runeTexture = new CanvasTexture(canvas)
  return runeTexture
}

const RING_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpin;
  uniform float uOpacity;
  uniform float uRainbow;
  varying vec2 vUv;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    vec2 p = vUv - 0.5;
    float a = uTime * uSpin;
    p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
    float m = texture2D(uMap, p + 0.5).a;
    float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
    vec3 col = mix(uColor, hue(fract(atan(p.y, p.x) / 6.2831 + uTime * 0.2)), uRainbow);
    gl_FragColor = vec4(col, m * uOpacity * pulse);
  }
`

export function runeMaterial(color, { spin = 0.6, opacity = 0.9, rainbow = false } = {}) {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: getRuneTexture() },
      uColor: { value: new Color(color) },
      uTime: shared.time,
      uSpin: { value: spin },
      uOpacity: { value: opacity },
      uRainbow: { value: rainbow ? 1 : 0 },
    },
    vertexShader: COLUMN_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

/** A spinning magic circle lying on the floor at `position`. */
export function RuneRing({ position, radius = 2, color = '#ffffff', spin = 0.6, opacity = 0.9, rainbow = false }) {
  const material = useMemo(() => runeMaterial(color, { spin, opacity, rainbow }), [color, spin, opacity, rainbow])
  return (
    <mesh position={[position[0], position[1] + 0.04, position[2]]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={6}>
      <planeGeometry args={[radius * 2, radius * 2]} />
    </mesh>
  )
}

export const glowClock = shared.time
