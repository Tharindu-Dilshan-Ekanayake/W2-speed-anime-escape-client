import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  Object3D,
  ShaderMaterial,
  Vector3,
} from 'three'

import { STAGES } from '../config'
import { runtime } from '../runtime'
import { themeOf } from '../themes'

/**
 * Sky, fog, sun and the far ocean. Everything eases toward the theme of the
 * stage the player is standing in, so walking from the sunny Sakura Village into
 * the Volcano turns the sky red over a couple of seconds.
 */

const themeKeyAt = (stage) => (stage <= 0 ? 'lobby' : STAGES[stage - 1].theme)

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uNight;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
    // Below the horizon, fade to the horizon colour (the fog hides the seam).
    col = mix(col, uHorizon, smoothstep(0.0, -0.2, d.y));
    // A dreamy rose-lilac glow banding the horizon by day, like an anime sky.
    col += vec3(1.0, 0.8, 0.7) * 0.0 * exp(-pow((d.y - 0.1) * 6.0, 2.0)) * (1.0 - uNight);
    col += vec3(0.4, 0.7, 1.0) * 0.0 * exp(-pow((d.y - 0.32) * 5.0, 2.0)) * (1.0 - uNight);
    // Sun (or moon at night): a soft disc and a wide glow.
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(s, 900.0) * 1.6 + pow(s, 12.0) * 0.25);
    // Stars at night.
    if (uNight > 0.01 && d.y > 0.02) {
      vec3 cell = floor(d * 180.0);
      float r = hash(cell);
      float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0);
      float star = step(0.985, r) * twinkle * smoothstep(0.02, 0.25, d.y);
      col += vec3(star) * uNight;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`

function makeSkyMaterial() {
  return new ShaderMaterial({
        uniforms: {
          uTop: { value: new Color('#3f9dff') },
          uHorizon: { value: new Color('#c4ecff') },
          uSun: { value: new Color('#fff6d0') },
          uSunDir: { value: new Vector3(0.4, 0.6, -0.7) },
          uNight: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: BackSide,
        depthWrite: false,
        fog: false,
      })
}

function Sky({ material }) {
  const ref = useRef(null)
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    ref.current?.position.copy(state.camera.position)
  })
  return (
    <mesh ref={ref} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  )
}

/** Puffy blocky clouds drifting round the horizon (hidden at night). */
function Clouds() {
  const ref = useRef(null)
  const dummy = useMemo(() => new Object3D(), [])
  const COUNT = 60
  const clouds = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const a = (i / COUNT) * Math.PI * 2 + Math.sin(i * 7.3) * 0.2
        const r = 260 + ((i * 53) % 140)
        return {
          a,
          r,
          y: 70 + ((i * 37) % 70),
          s: [24 + ((i * 13) % 30), 8 + ((i * 7) % 8), 16 + ((i * 11) % 18)],
          speed: 0.004 + ((i * 3) % 5) * 0.001,
        }
      }),
    [],
  )
  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const p = state.camera.position
    clouds.forEach((c, i) => {
      const a = c.a + t * c.speed
      dummy.position.set(p.x + Math.cos(a) * c.r, c.y, p.z + Math.sin(a) * c.r)
      dummy.scale.set(c.s[0], c.s[1], c.s[2])
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.material.opacity += ((runtime.night ? 0.15 : 0.92) - mesh.material.opacity) * 0.03
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.55} transparent opacity={0.9} fog={false} />
    </instancedMesh>
  )
}

/** Drifting motes / snow / embers in the air near the camera, per theme. */
const AIR_COUNT = 260
function AirParticles() {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(AIR_COUNT * 3)
    for (let i = 0; i < AIR_COUNT; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 80
      pos[i * 3 + 1] = Math.random() * 30
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color('#ffffff') }, uTime: { value: 0 }, uCenter: { value: new Vector3() }, uFall: { value: 0.5 }, uSize: { value: 7 } },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform vec3 uCenter; uniform float uFall; uniform float uSize;
          varying float vA;
          void main() {
            vec3 p = position;
            p.y = mod(p.y - uTime * uFall * 2.0, 30.0);
            p.x += sin(uTime * 0.6 + position.z) * 1.5;
            vec3 w = vec3(mod(p.x - uCenter.x + 40.0, 80.0) - 40.0 + uCenter.x, p.y + uCenter.y - 8.0, mod(p.z - uCenter.z + 40.0, 80.0) - 40.0 + uCenter.z);
            vec4 mv = modelViewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * 30.0 / max(1.0, -mv.z);
            vA = smoothstep(0.0, 4.0, p.y) * smoothstep(30.0, 24.0, p.y);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * vA * 0.8);
          }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  )
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uCenter.value.copy(runtime.playerPos)
  })
  useEffect(() => {
    runtime.airMaterial = material
  }, [material])
  return <points geometry={geometry} material={material} frustumCulled={false} />
}

const AIR = {
  sakura: ['#ffc8e0', 0.4, 9],
  ice: ['#ffffff', 0.9, 8],
  volcano: ['#ff8a2a', -0.6, 6],
  dragon: ['#ffaa3a', -0.6, 6],
  castle: ['#ff4a2a', -0.5, 6],
  crystal: ['#ff9af0', 0.2, 6],
  galaxy: ['#bfe8ff', 0.1, 5],
  shadow: ['#b47aff', -0.2, 6],
  neon: ['#00e5ff', -0.3, 5],
  ghost: ['#9af0ff', 0.15, 6],
  swamp: ['#c8ff6a', -0.2, 5],
  heaven: ['#fff2a8', 0.2, 6],
  candy: ['#ffffff', 0.4, 7],
}

/**
 * Lights + fog + sky + clouds, all easing to the current stage's theme.
 */
export function Environment() {
  const scene = useThree((s) => s.scene)
  const sun = useRef(null)
  const hemi = useRef(null)
  const target = useMemo(() => new Object3D(), [])
  const skyMaterial = useMemo(() => makeSkyMaterial(), [])
  const tmp = useMemo(
    () => ({ top: new Color(), horizon: new Color(), fog: new Color(), sun: new Color(), sky: new Color(), ground: new Color(), air: new Color() }),
    [],
  )

  useEffect(() => {
    scene.fog = new Fog('#d6ebfa', 120, 440)
    scene.add(target)
    return () => {
      scene.fog = null
      scene.remove(target)
    }
  }, [scene, target])

  useFrame((_state, delta) => {
    const theme = themeOf(themeKeyAt(runtime.stage))
    const k = 1 - Math.exp(-delta * 1.6)
    runtime.night = !!theme.night

    const sky = skyMaterial
    {
      sky.uniforms.uTop.value.lerp(tmp.top.set(theme.sky[0]), k)
      sky.uniforms.uHorizon.value.lerp(tmp.horizon.set(theme.sky[1]), k)
      sky.uniforms.uSun.value.lerp(tmp.sun.set(theme.night ? '#c8d8ff' : theme.sun || '#fff4c8'), k)
      sky.uniforms.uNight.value += ((theme.night ? 1 : 0) - sky.uniforms.uNight.value) * k
    }
    if (scene.fog) {
      scene.fog.color.lerp(tmp.fog.set(theme.fog), k)
      // Everything past the fog's far edge is fully fogged, so it is never drawn (see the camera's far plane).
      const far = theme.night ? 400 : 440
      scene.fog.near += ((theme.night ? 60 : 120) - scene.fog.near) * k
      scene.fog.far += (far - scene.fog.far) * k
    }
    if (hemi.current) {
      hemi.current.color.lerp(tmp.sky.set(theme.night ? '#b8c0ff' : '#dcecff'), k)
      hemi.current.groundColor.lerp(tmp.ground.set(theme.night ? '#5a4a7a' : '#7a6a50'), k)
      hemi.current.intensity += ((theme.night ? 2.1 : 0.85) - hemi.current.intensity) * k
    }
    if (sun.current) {
      const p = runtime.playerPos
      sun.current.position.set(p.x + 30, p.y + 60, p.z + 20)
      target.position.set(p.x, p.y, p.z - 6)
      sun.current.target = target
      sun.current.intensity += ((theme.night ? 1.9 : 2.1) - sun.current.intensity) * k
      sun.current.color.lerp(tmp.sun.set(theme.night ? '#d8dcff' : '#ffe6c4'), k)
    }
    const air = AIR[themeKeyAt(runtime.stage)] || ['#ffffff', 0.1, 0]
    const am = runtime.airMaterial
    if (am) {
      am.uniforms.uColor.value.lerp(tmp.air.set(air[0]), k)
      am.uniforms.uFall.value += (air[1] - am.uniforms.uFall.value) * k
      am.uniforms.uSize.value += (air[2] - am.uniforms.uSize.value) * k
    }
  })

  return (
    <>
      <Sky material={skyMaterial} />
      <Clouds />
      <AirParticles />
      <hemisphereLight ref={hemi} args={['#dff2ff', '#7a8a6a', 1.5]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2.2}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-radius={2}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
    </>
  )
}

export default Environment
