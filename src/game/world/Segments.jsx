import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedMesh, MeshLambertMaterial, MeshBasicMaterial, Object3D, ShaderMaterial } from 'three'

import { FLUID_Y } from '../config'
import { glowClock } from '../fx/Glow'
import { getMaterial, unitBox, unitSphere } from '../materials'
import { runtime } from '../runtime'
import { sfx } from '../sfx'
import { chevronTexture } from '../textures'
import { useHazard } from '../zones'
import { Block, Ramp } from './Primitives'

/**
 * The obstacle segments a stage is built from. Each gets its layout record from
 * layout.js (`seg`, with world z0 > z1), the stage width `W`, the theme and an
 * index for alternating floor colours. Surfaces are at y = 0 unless noted.
 */

const BASE = FLUID_Y - 1
const floorColor = (theme, i) => (i % 2 ? theme.floor2 : theme.floor)

/**
 * A slab whose top is at `top`. Normally it reaches down into the fluid; in
 * floating themes (sky, space...) it is a thin platform on a slim support.
 */
function Slab({ x = 0, z, len, width, top = 0, color, theme, tile = 1 }) {
  if (theme.float) {
    const t = 1.4
    return (
      <>
        <Block size={[width, t, len]} pos={[x, top - t / 2, z]} color={color} pattern={theme.pattern} tile={tile} />
        <Block size={[width + 0.3, 0.3, len + 0.3]} pos={[x, top - t - 0.1, z]} color={theme.trim} emissive={theme.trim} emissiveIntensity={0.5} solid={false} shadow={false} />
        <Block size={[Math.min(3, width * 0.3), top - t - BASE, Math.min(3, len * 0.3)]} pos={[x, (top - t + BASE) / 2, z]} color={theme.wall} solid={false} />
      </>
    )
  }
  const h = top - BASE
  return <Block size={[width, h, len]} pos={[x, top - h / 2, z]} color={color} pattern={theme.pattern} tile={tile} />
}

/** Glowing trim lines along both edges of a stretch of floor. */
function Edges({ z0, z1, width, color }) {
  const len = z0 - z1
  return (
    <>
      {[-1, 1].map((s) => (
        <Block key={s} size={[0.5, 0.36, len]} pos={[s * (width / 2 - 0.25), 0.08, (z0 + z1) / 2]} color={color} emissive={color} emissiveIntensity={0.6} solid={false} shadow={false} />
      ))}
    </>
  )
}

/** Painted ">>>" arrows down the middle of a runway. */
function Chevrons({ z0, z1, color }) {
  const texture = useMemo(() => chevronTexture(color), [color])
  const spots = []
  for (let z = z0 - 8; z > z1 + 4; z -= 14) spots.push(z)
  return spots.map((z) => (
    <mesh key={z} position={[0, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[3.2, 6.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} opacity={0.85} />
    </mesh>
  ))
}

// ---------------------------------------------------------------------------

export function RunSeg({ seg, W, theme, i }) {
  const mid = (seg.z0 + seg.z1) / 2
  return (
    <>
      <Slab z={mid} len={seg.len} width={W} color={floorColor(theme, i)} theme={theme} />
      <Edges z0={seg.z0} z1={seg.z1} width={W} color={theme.trim} />
      <Chevrons z0={seg.z0} z1={seg.z1} color={theme.accent} />
    </>
  )
}

export function GapsSeg({ seg, theme, i }) {
  return seg.platforms.map((p, k) => (
    <group key={k}>
      <Slab x={p.x} z={seg.z0 + p.z - p.len / 2} len={p.len} width={p.width} color={floorColor(theme, i + k)} theme={theme} />
      <Block size={[p.width, 0.3, 0.5]} pos={[p.x, 0.05, seg.z0 + p.z - 0.25]} color={theme.trim} emissive={theme.trim} emissiveIntensity={0.6} solid={false} shadow={false} />
    </group>
  ))
}

export function StonesSeg({ seg, theme }) {
  return seg.stones.map((s, k) => (
    <Slab key={k} x={s.x} z={seg.z0 + s.z} len={s.size} width={s.size} top={s.h} color={k % 3 ? theme.floor : theme.trim} theme={theme} />
  ))
}

export function NarrowSeg({ seg, theme }) {
  return seg.legs.map((leg, k) => {
    const next = seg.legs[k + 1]
    const zEnd = seg.z0 + leg.z - leg.len
    return (
      <group key={k}>
        <Slab x={leg.x} z={seg.z0 + leg.z - leg.len / 2} len={leg.len} width={leg.width} color={theme.floor} theme={theme} />
        <Block size={[leg.width + 0.1, 0.12, leg.len]} pos={[leg.x, 0.02, seg.z0 + leg.z - leg.len / 2]} color={theme.trim} emissive={theme.trim} emissiveIntensity={0.25} solid={false} shadow={false} />
        {next ? (
          <Slab x={(leg.x + next.x) / 2} z={zEnd - seg.pad / 2} len={seg.pad} width={Math.abs(leg.x - next.x) + leg.width} color={theme.floor2} theme={theme} />
        ) : (
          <Slab x={leg.x / 2} z={zEnd - 1} len={2} width={Math.abs(leg.x) + leg.width} color={theme.floor2} theme={theme} />
        )}
        {k === 0 && <Slab x={leg.x / 2} z={seg.z0 - 2} len={4} width={Math.abs(leg.x) + leg.width} color={theme.floor2} theme={theme} />}
      </group>
    )
  })
}

export function PillarsSeg({ seg, W, theme }) {
  return (
    <>
      {seg.pillars.map((p, k) => (
        <group key={k}>
          <Slab x={p.x} z={seg.z0 + p.z} len={p.size} width={p.size} top={p.top} color={k % 2 ? theme.floor : theme.floor2} theme={theme} />
          <Block size={[p.size + 0.2, 0.25, p.size + 0.2]} pos={[p.x, p.top + 0.02, seg.z0 + p.z]} color={theme.trim} emissive={theme.trim} emissiveIntensity={0.5} solid={false} shadow={false} />
        </group>
      ))}
      <Ramp width={W * 0.6} z0={seg.z0 + seg.rampZ} y0={seg.peak} len={seg.rampLen} rise={-seg.peak} color={theme.floor2} pattern={theme.pattern} />
      <Slab z={seg.z0 + seg.rampZ - seg.rampLen - 1} len={2.4} width={W * 0.6} color={theme.floor2} theme={theme} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Tornadoes: small twisters that sweep back and forth across the platform. Get
// caught in one and it throws you off the edge into the water - time your dash.
// ---------------------------------------------------------------------------

const TORNADO_HEIGHT = 6.4
const TORNADO_RADIUS = 1.7

const FUNNEL_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // The funnel sways more the higher it goes.
    float h = uv.y;
    p.x += sin(h * 5.0 + uTime * 3.0) * 0.35 * h;
    p.z += cos(h * 4.0 + uTime * 2.4) * 0.3 * h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const FUNNEL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    float y = vUv.y;
    float a = vUv.x * 6.2831;
    float s = sin(a * 3.0 + y * 8.0 - uTime * uSpin) * 0.5 + 0.5;
    float s2 = sin(a * 5.0 - y * 5.0 - uTime * uSpin * 1.7) * 0.5 + 0.5;
    float band = 0.35 + 0.5 * s * (0.6 + 0.4 * s2);
    vec3 col = mix(vec3(0.5, 0.56, 0.66), vec3(1.0), s) * (0.8 + 0.2 * s2);
    col = mix(col, uTint, 0.22);
    float fade = smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.78, 1.0, y) * 0.85);
    gl_FragColor = vec4(col, band * fade * 0.8);
  }
`

const funnelCache = new Map()
function funnelMaterial(tint, spin) {
  const key = `${tint}|${spin}`
  if (!funnelCache.has(key)) {
    funnelCache.set(
      key,
      new ShaderMaterial({
        uniforms: { uTime: glowClock, uSpin: { value: spin }, uTint: { value: new Color(tint) } },
        vertexShader: FUNNEL_VERT,
        fragmentShader: FUNNEL_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    )
  }
  return funnelCache.get(key)
}

const DEBRIS = 9

function Tornado({ z, amp, omega, phase, tint, W }) {
  const group = useRef(null)
  const debris = useRef(null)
  const outer = useMemo(() => funnelMaterial(tint, 9), [tint])
  const inner = useMemo(() => funnelMaterial(tint, -13), [tint])
  const xAt = (t) => Math.sin(t * omega + phase) * amp
  const test = useMemo(
    () => (px, feetY, pz) => {
      if (feetY > TORNADO_HEIGHT - 0.5 || feetY < -1) return false
      const tx = xAt(runtime.time)
      const dx = px - tx
      const dz = pz - z
      if (dx * dx + dz * dz > (TORNADO_RADIUS + 0.35) * (TORNADO_RADIUS + 0.35)) return false
      // Thrown away from the twister, sideways, off the platform.
      const side = dx >= 0 ? 1 : -1
      return { vx: side * 22, vy: 11, vz: 0 }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [z, amp, omega, phase],
  )
  useHazard(test)
  useFrame((state) => {
    const t = runtime.time
    group.current?.position.set(xAt(t), 0, z)
    const g = debris.current
    if (!g) return
    g.children.forEach((m, i) => {
      const h = (((i / DEBRIS) * TORNADO_HEIGHT + t * 1.6) % TORNADO_HEIGHT)
      const a = t * (5 + (i % 3)) + i * 2.4
      const r = 0.6 + (h / TORNADO_HEIGHT) * 1.7
      m.position.set(Math.cos(a) * r, h, Math.sin(a) * r)
      m.rotation.set(t * 3 + i, t * 2, i)
    })
    // Keep the camera honest: nothing to do per camera, funnels are double sided.
    void state
  })
  const debrisMat = useMemo(() => getMaterial({ color: '#8a6a4a' }), [])
  return (
    <>
      {/* The lane the twister sweeps along, so the danger can be read from afar. */}
      <Block size={[W - 1, 0.05, 3.6]} pos={[0, 0.045, z]} color="#ff5a5a" opacity={0.2} basic solid={false} shadow={false} />
      <group ref={group}>
        <mesh material={outer} position={[0, TORNADO_HEIGHT / 2, 0]} renderOrder={8}>
          <cylinderGeometry args={[2.4, 0.55, TORNADO_HEIGHT, 28, 8, true]} />
        </mesh>
        <mesh material={inner} position={[0, TORNADO_HEIGHT / 2, 0]} scale={[0.62, 1, 0.62]} renderOrder={8}>
          <cylinderGeometry args={[2.4, 0.55, TORNADO_HEIGHT, 24, 8, true]} />
        </mesh>
        <group ref={debris}>
          {Array.from({ length: DEBRIS }, (_, i) => (
            <mesh key={i} geometry={unitBox} material={debrisMat} scale={[0.28, 0.12, 0.2]} />
          ))}
        </group>
      </group>
    </>
  )
}

export function SpinnersSeg({ seg, W, theme, n }) {
  const count = n >= 9 ? 3 : 2
  const speed = Math.min(10, Math.max(4, 3.6 + n * 0.45))
  const amp = W / 2 - 1.8
  return seg.plats.map((p, k) => {
    const zc = seg.z0 + p.z
    return (
      <group key={k}>
        <Slab z={zc} len={p.len} width={W} color={floorColor(theme, k)} theme={theme} />
        <Edges z0={zc + p.len / 2} z1={zc - p.len / 2} width={W} color={theme.trim} />
        {Array.from({ length: count }, (_, j) => (
          <Tornado
            key={j}
            z={zc - p.len / 2 + ((j + 0.5) * p.len) / count}
            amp={amp}
            omega={speed / amp}
            phase={p.phase + j * Math.PI}
            tint={theme.accent}
            W={W}
          />
        ))}
      </group>
    )
  })
}

// ---------------------------------------------------------------------------
// Moving platforms (kinematic), sliding side to side over the fluid.
// ---------------------------------------------------------------------------

function Mover({ z, size, amp, period, phase, color, trim }) {
  const body = useRef(null)
  const record = useMemo(() => ({ x: 0, y: 0, z, half: [size / 2, size / 2], vx: 0, vz: 0 }), [z, size])
  useEffect(() => {
    runtime.movers.add(record)
    return () => runtime.movers.delete(record)
  }, [record])
  useFrame(() => {
    const t = runtime.time
    const w = (Math.PI * 2) / period
    const x = Math.sin(t * w + phase) * amp
    record.x = x
    record.vx = Math.cos(t * w + phase) * amp * w
    body.current?.setNextKinematicTranslation({ x, y: -0.6, z })
  })
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders="cuboid" position={[0, -0.6, z]}>
      <mesh geometry={unitBox} material={getMaterial({ color, pattern: 'studs' })} scale={[size, 1.2, size]} castShadow receiveShadow />
      <mesh geometry={unitBox} material={getMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.7 })} position={[0, 0.62, 0]} scale={[size + 0.1, 0.06, size + 0.1]} />
    </RigidBody>
  )
}

export function MoversSeg({ seg, theme }) {
  return seg.movers.map((m, k) => (
    <Mover key={k} z={seg.z0 + m.z} size={m.size} amp={m.amp} period={m.period} phase={m.phase} color={k % 2 ? theme.floor : theme.floor2} trim={theme.trim} />
  ))
}

// ---------------------------------------------------------------------------
// Lasers: full curtains that blink on and off, and low beams to jump.
// ---------------------------------------------------------------------------

function LaserGate({ z, W, gate, color }) {
  const beams = useRef(null)
  const material = useMemo(() => new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }), [color])
  const test = useMemo(
    () => (px, feetY, pz) => {
      if (Math.abs(pz - z) > 0.45 || Math.abs(px) > W / 2) return false
      if (gate.low) return feetY < 0.75 && feetY > -1
      const t = (runtime.time / gate.period + gate.phase) % 1
      return t < gate.on && feetY < 3
    },
    [z, W, gate],
  )
  useHazard(test)
  useFrame(() => {
    if (gate.low) {
      material.opacity = 0.75 + 0.25 * Math.sin(runtime.time * 20)
      return
    }
    const t = (runtime.time / gate.period + gate.phase) % 1
    const on = t < gate.on
    // Flicker a warning just before switching on.
    const warn = !on && t > 0.85
    material.opacity = on ? 0.9 : warn ? (Math.sin(runtime.time * 50) > 0 ? 0.35 : 0.05) : 0.05
    if (beams.current) beams.current.visible = on || warn
  })
  const heights = gate.low ? [0.45] : [0.35, 0.95, 1.55, 2.15, 2.75]
  const post = getMaterial({ color: '#2a2a34' })
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={unitBox} material={post} position={[s * (W / 2 + 0.6), 2, z]} scale={[1, 4, 1]} castShadow />
      ))}
      <group ref={beams}>
        {heights.map((h) => (
          <mesh key={h} geometry={unitBox} material={material} position={[0, h, z]} scale={[W, 0.12, 0.12]} />
        ))}
      </group>
      {[-1, 1].map((s) => (
        <mesh key={`e${s}`} geometry={unitSphere} material={material} position={[s * (W / 2 + 0.1), heights[0], z]} scale={[0.5, 0.5, 0.5]} />
      ))}
    </group>
  )
}

export function LasersSeg({ seg, W, theme, i }) {
  const mid = (seg.z0 + seg.z1) / 2
  return (
    <>
      <Slab z={mid} len={seg.len} width={W} color={floorColor(theme, i)} theme={theme} />
      {[-1, 1].map((s) => (
        <Block key={s} size={[1.2, 4.5, seg.len]} pos={[s * (W / 2 + 0.6), 2.25, mid]} color={theme.wall} pattern="bricks" />
      ))}
      {seg.gates.map((g, k) => (
        <LaserGate key={k} z={seg.z0 + g.z} W={W} gate={g} color={g.low ? '#ffe23a' : '#ff2a3a'} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Crushers: heavy spiked blocks slamming down in three lanes.
// ---------------------------------------------------------------------------

function crusherHeight(t) {
  // 0..1 cycle: hold up, fall fast, hold down, rise.
  if (t < 0.5) return 1
  if (t < 0.58) return 1 - (t - 0.5) / 0.08
  if (t < 0.75) return 0
  return (t - 0.75) / 0.25
}
const CRUSH_TOP = 6.5

function CrusherRow({ z, W, row, color }) {
  const refs = useRef([])
  const lanes = useMemo(() => [-1, 0, 1].map((l, k) => ({ x: (l * W) / 3, phase: (row.phase + k * 0.33) % 1 })), [W, row.phase])
  const laneW = W / 3 - 0.4
  const test = useMemo(
    () => (px, feetY, pz) => {
      if (Math.abs(pz - z) > 2.2) return false
      for (const lane of lanes) {
        if (Math.abs(px - lane.x) > laneW / 2 + 0.3) continue
        const h = crusherHeight((runtime.time / row.period + lane.phase) % 1)
        const bottom = 0.2 + h * CRUSH_TOP
        if (bottom < feetY + 1.7 && feetY < 2) return true
      }
      return false
    },
    [z, lanes, laneW, row.period],
  )
  useHazard(test)
  const lastSlam = useRef([0, 0, 0])
  useFrame(() => {
    lanes.forEach((lane, k) => {
      const h = crusherHeight((runtime.time / row.period + lane.phase) % 1)
      const m = refs.current[k]
      if (m) m.position.y = 0.2 + h * CRUSH_TOP + 1.5
      if (h === 0 && lastSlam.current[k] !== 0 && Math.abs(runtime.playerPos.z - z) < 30) sfx.land(0.5)
      lastSlam.current[k] = h
    })
  })
  const body = getMaterial({ color: '#8a8aa8', pattern: 'studs' })
  const spike = getMaterial({ color, emissive: color, emissiveIntensity: 0.6 })
  return lanes.map((lane, k) => (
    <group key={k} ref={(el) => (refs.current[k] = el)} position={[lane.x, CRUSH_TOP, z]}>
      <mesh geometry={unitBox} material={body} scale={[laneW, 3, 3.6]} castShadow />
      <mesh geometry={unitBox} material={spike} position={[0, -1.6, 0]} scale={[laneW - 0.2, 0.3, 3.4]} />
    </group>
  ))
}

export function CrushersSeg({ seg, W, theme, i }) {
  const mid = (seg.z0 + seg.z1) / 2
  return (
    <>
      <Slab z={mid} len={seg.len} width={W} color={floorColor(theme, i)} theme={theme} />
      <Edges z0={seg.z0} z1={seg.z1} width={W} color={theme.trim} />
      {seg.rows.map((r, k) => (
        <group key={k}>
          {[-1, 1].map((s) => (
            <Block key={s} size={[1.4, CRUSH_TOP + 4, 1.4]} pos={[s * (W / 2 + 0.7), (CRUSH_TOP + 4) / 2, seg.z0 + r.z]} color={theme.wall} pattern="bricks" />
          ))}
          <Block size={[W + 2.8, 1, 1.4]} pos={[0, CRUSH_TOP + 4.5, seg.z0 + r.z]} color={theme.trim} solid={false} />
          <CrusherRow z={seg.z0 + r.z} W={W} row={r} color={theme.accent} />
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Boulders: a ramp up with giant balls rolling down it at you.
// ---------------------------------------------------------------------------

const BOULDERS = 14
const _o = new Object3D()

export function BouldersSeg({ seg, W, theme, i }) {
  const { z0, rampLen, rise, top, down } = seg
  const zTop = z0 - rampLen
  const zFar = zTop - top
  const R = 2.1
  const mesh = useMemo(() => {
    const m = new InstancedMesh(unitSphere, new MeshLambertMaterial({ color: theme.accent, emissive: new Color(theme.accent), emissiveIntensity: 0.25 }), BOULDERS)
    m.castShadow = true
    m.frustumCulled = false
    return m
  }, [theme.accent])
  const balls = useMemo(() => Array.from({ length: BOULDERS }, () => ({ live: false, x: 0, z: 0, y: 0, roll: 0 })), [])
  const timer = useRef(0)
  const surface = (z) => (z <= zTop ? rise : rise * Math.max(0, (z0 - z) / rampLen))
  const test = useMemo(
    () => (px, feetY, pz) => {
      const cy = feetY + 0.9
      for (const b of balls) {
        if (!b.live) continue
        const dx = px - b.x
        const dy = cy - b.y
        const dz = pz - b.z
        if (dx * dx + dy * dy + dz * dz < (R + 0.5) * (R + 0.5)) return true
      }
      return false
    },
    [balls],
  )
  useHazard(test)
  useFrame((_s, dt) => {
    const step = Math.min(dt, 0.05)
    // Only roll while the player is near, so far stages cost nothing.
    const near = runtime.playerPos.z < z0 + 60 && runtime.playerPos.z > seg.z1 - 30
    timer.current -= step
    if (near && timer.current <= 0) {
      timer.current = seg.every * (0.7 + Math.random() * 0.6)
      const b = balls.find((x) => !x.live)
      if (b) {
        b.live = true
        b.x = (Math.random() - 0.5) * (W - 2 * R - 1)
        b.z = zFar + R
        b.roll = 0
      }
    }
    balls.forEach((b, k) => {
      if (b.live) {
        b.z += seg.speed * step
        b.roll += (seg.speed * step) / R
        b.y = surface(b.z) + R
        if (b.z > z0 + 1) b.live = false
      }
      _o.position.set(b.x, b.live ? b.y : -100, b.z)
      _o.rotation.set(b.roll, 0, 0)
      _o.scale.setScalar(R * 2)
      _o.updateMatrix()
      mesh.setMatrixAt(k, _o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  useEffect(() => () => mesh.material.dispose(), [mesh])

  return (
    <>
      <Ramp width={W} z0={z0} y0={0} len={rampLen} rise={rise} color={floorColor(theme, i)} pattern={theme.pattern} />
      <Block size={[W, rise - BASE, top]} pos={[0, (rise + BASE) / 2, zTop - top / 2]} color={floorColor(theme, i + 1)} pattern={theme.pattern} />
      <Ramp width={W} z0={zFar} y0={rise} len={down} rise={-rise} color={floorColor(theme, i)} pattern={theme.pattern} />
      {[-1, 1].map((s) => (
        <Block key={s} size={[1.2, 3, rampLen + top]} pos={[s * (W / 2 + 0.6), rise / 2 + 1, z0 - (rampLen + top) / 2]} color={theme.wall} pattern="bricks" solid={false} />
      ))}
      <primitive object={mesh} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Zigzag: platforms stepping left and right over the fluid.
// ---------------------------------------------------------------------------

export function ZigzagSeg({ seg, theme, i }) {
  return seg.platforms.map((p, k) => (
    <group key={k}>
      <Slab x={p.x} z={seg.z0 + p.z - p.len / 2} len={p.len} width={p.width} color={floorColor(theme, i + k)} theme={theme} />
      <Block size={[p.width, 0.3, 0.5]} pos={[p.x, 0.05, seg.z0 + p.z - 0.25]} color={theme.accent} emissive={theme.accent} emissiveIntensity={0.7} solid={false} shadow={false} />
    </group>
  ))
}

// ---------------------------------------------------------------------------
// Climb: a long ramp up to a high narrow bridge with no rails, then back down.
// ---------------------------------------------------------------------------

export function ClimbSeg({ seg, W, theme, i }) {
  const { z0, up, top, down, rise, bridgeW } = seg
  const zTop = z0 - up
  const zEnd = zTop - top
  return (
    <>
      <Ramp width={W * 0.7} z0={z0} y0={0} len={up} rise={rise} color={floorColor(theme, i)} pattern={theme.pattern} />
      <Block size={[bridgeW, 1.2, top + 0.4]} pos={[0, rise - 0.6, zTop - top / 2]} color={theme.floor2} pattern={theme.pattern} />
      {[-1, 1].map((s) => (
        <Block key={s} size={[0.3, 0.2, top]} pos={[s * (bridgeW / 2 - 0.15), rise + 0.1, zTop - top / 2]} color={theme.accent} emissive={theme.accent} emissiveIntensity={0.8} solid={false} shadow={false} />
      ))}
      {/* Support legs down into the fluid. */}
      {Array.from({ length: Math.max(1, Math.floor(top / 14)) }, (_, k) => (
        <Block key={k} size={[1.4, rise - 1.2 - BASE, 1.4]} pos={[0, (rise - 1.2 + BASE) / 2, zTop - (k + 0.5) * (top / Math.max(1, Math.floor(top / 14)))]} color={theme.wall} solid={false} />
      ))}
      <Ramp width={W * 0.7} z0={zEnd} y0={rise} len={down} rise={-rise} color={floorColor(theme, i + 1)} pattern={theme.pattern} />
      <Slab z={seg.z1 + 1} len={2.4} width={W * 0.7} color={floorColor(theme, i + 1)} theme={theme} />
    </>
  )
}
