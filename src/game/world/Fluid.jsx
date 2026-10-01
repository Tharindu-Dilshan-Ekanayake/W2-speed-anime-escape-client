import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { Color, ShaderMaterial } from 'three'

/**
 * The deadly stuff under every path: sea, lava, acid, the void, candy syrup or a
 * sea of clouds. One procedural shader (no textures), coloured per kind, with
 * world-space patterns so neighbouring planes line up.
 */

const KINDS = {
  water: { a: '#1f8fff', b: '#5fd0ff', c: '#e8fbff', glow: 0.15, mode: 0, speed: 1 },
  lava: { a: '#c81e00', b: '#ff7a00', c: '#ffe066', glow: 1, mode: 1, speed: 0.5 },
  acid: { a: '#2a8a10', b: '#7dff2a', c: '#e8ffb0', glow: 0.8, mode: 1, speed: 0.7 },
  void: { a: '#05000f', b: '#3a0a6a', c: '#c8a8ff', glow: 0.6, mode: 2, speed: 0.4 },
  candy: { a: '#ff5fb8', b: '#ffb3e0', c: '#ffffff', glow: 0.35, mode: 3, speed: 0.6 },
  cloud: { a: '#dfe8ff', b: '#ffffff', c: '#ffffff', glow: 0.55, mode: 4, speed: 0.25 },
  quicksand: { a: '#c8904a', b: '#f2c47a', c: '#fff0c8', glow: 0.1, mode: 3, speed: 0.3 },
}

const VERT = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform float uGlow;
  uniform float uTime;
  uniform int uMode;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  // Cell edges, for lava crusts and water caustics.
  float cells(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(hash(i + g), hash(i + g + 17.0));
        o = 0.5 + 0.45 * sin(uTime * 0.6 + 6.2831 * o);
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    return d2 - d1;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 col;
    if (uMode == 0) {
      // Water: rolling bands, cell caustics and sparkles.
      float n = fbm(p * 0.05 + vec2(uTime * 0.05, uTime * 0.03));
      float c = cells(p * 0.12 + n * 1.5);
      col = mix(uA, uB, n);
      col = mix(col, uC, smoothstep(0.12, 0.0, c) * 0.55);
      float sp = step(0.985, hash(floor(p * 1.5) + floor(uTime * 3.0)));
      col += sp * 0.35;
    } else if (uMode == 1) {
      // Lava / acid: dark crust plates over glowing molten cracks.
      float n = fbm(p * 0.06 + vec2(uTime * 0.02, -uTime * 0.03));
      float c = cells(p * 0.09 + n);
      float crack = smoothstep(0.18, 0.0, c);
      col = mix(uA, uB, n * 1.2);
      col = mix(col, uC, crack);
      col *= 0.85 + 0.25 * sin(uTime * 2.0 + n * 9.0);
    } else if (uMode == 2) {
      // Void: swirling dark nebula with twinkling stars.
      float n = fbm(p * 0.03 + vec2(sin(uTime * 0.1), cos(uTime * 0.1)) * 2.0);
      col = mix(uA, uB, smoothstep(0.3, 0.9, n));
      float st = step(0.992, hash(floor(p * 0.8)));
      col += uC * st * (0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(p * 0.8)) * 30.0));
    } else if (uMode == 3) {
      // Candy syrup: swirly stripes.
      float n = fbm(p * 0.04 + uTime * 0.05);
      float s = sin((p.x + p.y) * 0.25 + n * 6.0 + uTime);
      col = mix(uA, uB, smoothstep(-0.2, 0.2, s));
      col = mix(col, uC, smoothstep(0.85, 1.0, s) * 0.6);
    } else {
      // A sea of clouds.
      float n = fbm(p * 0.025 + vec2(uTime * 0.02, 0.0));
      float m = fbm(p * 0.06 - vec2(0.0, uTime * 0.03));
      col = mix(uA, uB, smoothstep(0.35, 0.75, n * 0.7 + m * 0.5));
    }
    gl_FragColor = vec4(col * (1.0 + uGlow * 0.15), 1.0);
    #include <fog_fragment>
  }
`

const cache = new Map()
export function fluidMaterial(kind) {
  if (cache.has(kind)) return cache.get(kind)
  const k = KINDS[kind] || KINDS.water
  const m = new ShaderMaterial({
    uniforms: {
      uA: { value: new Color(k.a) },
      uB: { value: new Color(k.b) },
      uC: { value: new Color(k.c) },
      uGlow: { value: k.glow },
      uTime: { value: 0 },
      uMode: { value: k.mode },
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
  })
  m.userData.speed = k.speed
  cache.set(kind, m)
  return m
}

/** A flat sheet of fluid. `area` = [minX, maxX, minZ, maxZ]. */
export function Fluid({ kind = 'water', area, y }) {
  const material = useMemo(() => fluidMaterial(kind), [kind])
  const [x0, x1, z0, z1] = area
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime * material.userData.speed
  })
  return (
    <mesh material={material} position={[(x0 + x1) / 2, y, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
    </mesh>
  )
}

export default Fluid
