import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  SpriteMaterial,
  Sprite,
  Group,
} from 'three'

import { abbreviate } from '../format'
import { runtime } from '../runtime'
import { textTexture } from '../textures'

/**
 * World-space feedback around the player:
 *   SpeedPopups   "+5 👟" numbers floating up from every step
 *   Confetti      a burst of colour when a win pad pays out or a trial is cleared
 */

// ---------------------------------------------------------------------------
// "+N" popups
// ---------------------------------------------------------------------------

const POPUPS = 14
const POP_LIFE = 1.1
const textCache = new Map()
function popupTexture(value) {
  const key = abbreviate(value)
  if (!textCache.has(key)) {
    if (textCache.size > 80) textCache.clear()
    textCache.set(key, textTexture([{ text: `+${key} 👟`, size: 64, gradient: ['#ffffff', '#bfe8ff', '#5fc8ff'], strokeWidth: 9 }]))
  }
  return textCache.get(key)
}

export function SpeedPopups() {
  const group = useMemo(() => {
    const g = new Group()
    for (let i = 0; i < POPUPS; i += 1) {
      // Created with a texture, so the textured sprite shader is compiled up front.
      const s = new Sprite(new SpriteMaterial({ map: popupTexture(1).texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false, sizeAttenuation: false }))
      s.visible = false
      s.renderOrder = 20
      s.userData = { life: 0, vx: 0 }
      g.add(s)
    }
    g.userData.next = 0
    return g
  }, [])

  useFrame((_s, dt) => {
    while (runtime.floaters.length) {
      const f = runtime.floaters.shift()
      const s = group.children[group.userData.next]
      group.userData.next = (group.userData.next + 1) % POPUPS
      const { texture, aspect } = popupTexture(f.value)
      s.material.map = texture
      s.material.needsUpdate = true
      s.userData.aspect = aspect
      s.userData.life = 0
      s.userData.vx = group.userData.side * 0.35
      // Beside the character, alternating sides, never in front of the face.
      group.userData.side = -(group.userData.side || 1)
      s.position.set(f.x + group.userData.side * (0.9 + Math.random() * 0.4), f.y + 0.2, f.z + (Math.random() - 0.5) * 0.4)
      s.visible = true
    }
    for (const s of group.children) {
      if (!s.visible) continue
      s.userData.life += dt
      const t = s.userData.life / POP_LIFE
      if (t >= 1) {
        s.visible = false
        continue
      }
      s.position.y += dt * 1.1
      s.position.x += s.userData.vx * dt
      const pop = t < 0.15 ? 0.5 + (t / 0.15) * 0.6 : 1.1 - (t - 0.15) * 0.25
      // Screen-sized (sizeAttenuation is off): the same small size however close the camera is.
      const h = 0.062 * pop
      s.scale.set(h * s.userData.aspect, h, 1)
      s.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
    }
  })

  return <primitive object={group} />
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

const CONFETTI = 160
const COLOURS = ['#ff4a6a', '#ffd23f', '#39d353', '#1fb8ff', '#c47bff', '#ffffff', '#ff8a1f']

export function Confetti() {
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(CONFETTI * 3), 3))
    const col = new Float32Array(CONFETTI * 3)
    const c = new Color()
    for (let i = 0; i < CONFETTI; i += 1) col.set(c.set(COLOURS[i % COLOURS.length]).toArray(), i * 3)
    g.setAttribute('color', new BufferAttribute(col, 3))
    return g
  }, [])
  const vel = useMemo(() => new Float32Array(CONFETTI * 3), [])
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uAlpha: { value: 0 } },
        vertexColors: true,
        vertexShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = 180.0 / max(1.0, -mv.z);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uAlpha;
          varying vec3 vColor;
          void main() {
            vec2 c = abs(gl_PointCoord - 0.5);
            if (c.x > 0.42 || c.y > 0.22) discard;
            gl_FragColor = vec4(vColor, uAlpha);
          }`,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  const state = useRef({ seen: runtime.celebrations, t: 99 })
  const pts = useRef(null)
  useFrame((_s, dt) => {
    const st = state.current
    const p = runtime.playerPos
    if (runtime.celebrations !== st.seen) {
      st.seen = runtime.celebrations
      st.t = 0
      const pos = geo.attributes.position.array
      for (let i = 0; i < CONFETTI; i += 1) {
        pos.set([p.x, p.y + 1, p.z], i * 3)
        const a = Math.random() * Math.PI * 2
        const sp = 2 + Math.random() * 6
        vel.set([Math.cos(a) * sp, 8 + Math.random() * 9, Math.sin(a) * sp], i * 3)
      }
    }
    st.t += dt
    if (pts.current) pts.current.visible = st.t < 3
    if (st.t >= 3) return
    mat.uniforms.uAlpha.value = Math.min(1, (3 - st.t) / 0.8)
    const pos = geo.attributes.position.array
    for (let i = 0; i < CONFETTI; i += 1) {
      vel[i * 3 + 1] = Math.max(-3, vel[i * 3 + 1] - 14 * dt)
      vel[i * 3] *= 1 - dt * 0.8
      vel[i * 3 + 2] *= 1 - dt * 0.8
      pos[i * 3] += (vel[i * 3] + Math.sin(st.t * 6 + i) * 0.8) * dt
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt
    }
    geo.attributes.position.needsUpdate = true
  })
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} visible={false} />
}
