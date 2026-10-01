import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, DoubleSide, Quaternion, ShaderMaterial, Vector3 } from 'three'

import { glowClock, RisingSparks, RuneRing } from './Glow'

/**
 * The equipped anime's aura, worn round the body like a power-up in the show:
 *   - a big flame of energy streaming up behind the character (always facing
 *     the camera, and drawn *behind* the body so the character stays readable)
 *   - a glowing pool on the ground with pulsing shockwave rings
 *   tier 2+  a magic circle turning under the feet
 *   tier 3+  spirit orbs circling the waist
 *   tier 4+  energy sparks streaming up, a second hotter flame layer
 *   tier 5   a bigger flame, more sparks, rainbow / lightning for the top animes
 * It flares up when the character runs. Boots add a glow at the feet.
 */

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FLAME_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uTime;
  uniform float uPower;
  uniform float uRainbow;
  uniform float uSpeed;
  uniform float uSeed;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15; }
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    float x = (vUv.x - 0.5) * 2.0;
    float y = vUv.y;
    float t = uTime * uSpeed + uSeed;
    // Flames lick upward: the noise field scrolls down the quad.
    float n = fbm(vec2(x * 1.7 + uSeed, y * 2.6 - t * 1.9));
    float n2 = fbm(vec2(x * 3.1 - uSeed, y * 4.2 - t * 3.1));
    // Wide at the foot, tapering to tongues at the top.
    float width = mix(0.82, 0.04, pow(y, 0.85));
    float edge = abs(x) + (n - 0.42) * 0.9 * (0.25 + y) + (n2 - 0.4) * 0.35 * y - width;
    float body = smoothstep(0.12, -0.2, edge);
    float core = smoothstep(0.0, -0.6, edge) * (1.0 - y * 0.7);
    // Bright streaks of energy rising through the flame.
    float streak = pow(abs(sin(x * 14.0 + n * 5.0 - t * 0.8)), 10.0) * 0.5 * (1.0 - y);
    vec3 base = mix(uColor, hue(fract(y * 0.5 + uTime * 0.25 + n * 0.3)), uRainbow);
    vec3 hot = mix(uColor2, vec3(1.0), 0.55);
    vec3 col = mix(base, hot, core) + hot * streak;
    float fade = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.55, 1.0, y));
    gl_FragColor = vec4(col, (body * 0.8 + core * 0.4 + streak * body) * fade * uPower);
  }
`

const POOL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uTime;
  uniform float uPower;
  uniform float uRainbow;
  varying vec2 vUv;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float glow = pow(1.0 - r, 1.6);
    // Rings pulsing outward from the feet.
    float ring = smoothstep(0.1, 0.0, abs(fract(r * 1.6 - uTime * 0.7) - 0.5) - 0.42) * (1.0 - r);
    vec3 c = mix(uColor, uColor2, r);
    c = mix(c, hue(fract(r + uTime * 0.2)), uRainbow);
    gl_FragColor = vec4(c, (glow * 0.55 + ring * 0.9) * uPower);
  }
`

function makeMaterial(frag, color, color2, rainbow, extra = {}) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uColor2: { value: new Color(color2 || color) },
      uTime: glowClock,
      uPower: { value: 1 },
      uRainbow: { value: rainbow ? 1 : 0 },
      uSpeed: { value: 1 },
      uSeed: { value: 0 },
      ...extra,
    },
    vertexShader: QUAD_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  })
}

const _q = new Quaternion()
const _dir = new Vector3()

/**
 * A flame quad that always faces the camera and sits a little behind the body
 * (away from the camera), so the character covers it where they overlap.
 */
function Flame({ material, width, height, back, lift = 0 }) {
  const ref = useRef(null)
  useFrame((state) => {
    const mesh = ref.current
    const parent = mesh?.parent
    if (!parent) return
    parent.getWorldQuaternion(_q).invert()
    mesh.quaternion.copy(_q).multiply(state.camera.quaternion)
    state.camera.getWorldDirection(_dir)
    _dir.applyQuaternion(_q)
    mesh.position.set(_dir.x * back, height / 2 - 0.15 + lift, _dir.z * back)
  })
  return (
    <mesh ref={ref} material={material} scale={[width, height, 1]} renderOrder={9}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

function Orbs({ color, count = 3, rainbow }) {
  const ref = useRef(null)
  const material = useMemo(() => makeMaterial(POOL_FRAG, color, '#ffffff', rainbow), [color, rainbow])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = glowClock.value
    g.children.forEach((m, i) => {
      const a = t * 2.4 + (i / count) * Math.PI * 2
      m.position.set(Math.cos(a) * 0.85, 1.0 + Math.sin(t * 3 + i) * 0.35, Math.sin(a) * 0.85)
    })
  })
  return (
    <group ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} material={material} scale={0.34}>
          <sphereGeometry args={[0.5, 12, 8]} />
        </mesh>
      ))}
    </group>
  )
}

/** One material per aura shader, for the warm-up (see world/warmup.js). */
export function auraMaterialsForWarmUp() {
  return [makeMaterial(FLAME_FRAG, '#ffffff', '#ffffff', false), makeMaterial(POOL_FRAG, '#ffffff', '#ffffff', false)]
}

export function Aura({ character, boots, motionRef }) {
  const aura = character?.aura
  const tier = aura?.tier || 0
  const rainbow = !!aura?.rainbow

  const flame = useMemo(() => (aura ? makeMaterial(FLAME_FRAG, aura.color, aura.color2, rainbow, { uSeed: { value: 1.7 } }) : null), [aura, rainbow])
  const flame2 = useMemo(
    () => (aura && tier >= 4 ? makeMaterial(FLAME_FRAG, aura.color2 || aura.color, aura.color, rainbow, { uSeed: { value: 5.3 }, uSpeed: { value: 1.35 } }) : null),
    [aura, tier, rainbow],
  )
  const pool = useMemo(() => (aura ? makeMaterial(POOL_FRAG, aura.color, aura.color2, rainbow) : null), [aura, rainbow])
  const flare = useRef(0)

  useFrame((_s, dt) => {
    const run = Math.min(1, (motionRef.current?.speed || 0) / 8)
    flare.current += (run - flare.current) * Math.min(1, dt * 4)
    const f = flare.current
    if (flame) flame.uniforms.uPower.value = 0.55 + tier * 0.1 + f * 0.5
    if (flame2) flame2.uniforms.uPower.value = 0.4 + f * 0.5
    if (pool) pool.uniforms.uPower.value = 0.6 + f * 0.5
  })

  if (!aura && !boots) return null
  const w = 1.5 + tier * 0.34
  const h = 2.5 + tier * 0.5
  return (
    <group>
      {flame && <Flame material={flame} width={w} height={h} back={0.7} />}
      {flame2 && <Flame material={flame2} width={w * 0.75} height={h * 0.82} back={0.55} />}
      {pool && (
        <mesh material={pool} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={[2.2 + tier * 0.5, 2.2 + tier * 0.5, 1]} renderOrder={6}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      )}
      {tier >= 2 && <RuneRing position={[0, 0.06, 0]} radius={0.9 + tier * 0.12} color={aura.color} spin={1.2} opacity={0.7} rainbow={rainbow} />}
      {tier >= 3 && <Orbs color={aura.color2 || aura.color} count={tier >= 5 ? 5 : 3} rainbow={rainbow} />}
      {tier >= 1 && <RisingSparks position={[0, 0, 0]} radius={0.7} height={2.2 + tier * 0.3} count={8 + tier * 6} color={aura.color} size={2.2} speed={0.7 + tier * 0.1} rainbow={rainbow} />}
      {boots && <RisingSparks position={[0, 0, 0]} radius={0.4} height={0.7} count={12} color={boots.glow} size={1.8} speed={1.2} />}
    </group>
  )
}

export default Aura
