import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'

import { ANIMES, characterById } from '../config'
import { unitBox } from '../materials'
import { runtime } from '../runtime'
import { useGame } from '../store'

/**
 * The effect every anime leaves behind while it runs: dust, shadows, flames,
 * butterflies, lightning... one kind per character (`anime.fx`), emitted faster and
 * bigger the pricier the character, with glowing afterimages for the top ones
 * (`anime.ghost`). Animes don't change the stats, so this is what they're worth.
 * Every character also sprays sparks from its feet in its own colour. Particles
 * live in world space, so running leaves a trail.
 */

// ---------------------------------------------------------------------------
// Sprite atlas: 4 x 3 white shapes, tinted per particle.
// ---------------------------------------------------------------------------

const COLS = 4
const ROWS = 4
const CELL = 64
const SPRITE = { dot: 0, star: 1, flame: 2, butterfly: 3, feather: 4, leaf: 5, crescent: 6, bolt: 7, ring: 8, smoke: 9, drop: 10, petal: 11, flake: 12, heart: 13, bubble: 14, diamond: 15 }

function softFill(ctx, r, inner = 1) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
  g.addColorStop(0, `rgba(255,255,255,${inner})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  return g
}

const DRAW = [
  // dot
  (ctx) => {
    ctx.fillStyle = softFill(ctx, 30)
    ctx.fillRect(-32, -32, 64, 64)
  },
  // star: a four-point sparkle
  (ctx) => {
    ctx.fillStyle = softFill(ctx, 14)
    ctx.fillRect(-32, -32, 64, 64)
    ctx.fillStyle = '#fff'
    for (const [w, h] of [
      [5, 29],
      [29, 5],
    ]) {
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.quadraticCurveTo(w * 0.25, -w * 0.25, w, 0)
      ctx.quadraticCurveTo(w * 0.25, w * 0.25, 0, h)
      ctx.quadraticCurveTo(-w * 0.25, w * 0.25, -w, 0)
      ctx.quadraticCurveTo(-w * 0.25, -w * 0.25, 0, -h)
      ctx.fill()
    }
  },
  // flame: a teardrop tongue, hot in the middle
  (ctx) => {
    const g = ctx.createRadialGradient(0, 10, 2, 0, 6, 26)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.75)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, -30)
    ctx.bezierCurveTo(8, -12, 22, 0, 18, 14)
    ctx.bezierCurveTo(14, 28, -14, 28, -18, 14)
    ctx.bezierCurveTo(-22, 0, -8, -12, 0, -30)
    ctx.fill()
  },
  // butterfly
  (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * 13, -8, 13, 16, s * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(s * 10, 13, 8, 11, -s * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(120,120,140,1)'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * 14, -9, 5, 7, s * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#333'
    ctx.fillRect(-2, -18, 4, 38)
  },
  // feather
  (ctx) => {
    ctx.rotate(0.5)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(0, -30)
    ctx.quadraticCurveTo(13, -4, 2, 26)
    ctx.lineTo(-2, 26)
    ctx.quadraticCurveTo(-13, -4, 0, -30)
    ctx.fill()
    ctx.strokeStyle = 'rgba(150,150,160,1)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -26)
    ctx.lineTo(0, 30)
    ctx.stroke()
  },
  // leaf
  (ctx) => {
    ctx.rotate(-0.6)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(0, -26)
    ctx.quadraticCurveTo(20, 0, 0, 26)
    ctx.quadraticCurveTo(-20, 0, 0, -26)
    ctx.fill()
    ctx.strokeStyle = 'rgba(170,170,170,1)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -22)
    ctx.lineTo(0, 24)
    ctx.stroke()
  },
  // crescent: a slash mark
  (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(0, 0, 28, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(9, -7, 27, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  },
  // bolt
  (ctx) => {
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(6, -30)
    ctx.lineTo(-12, 2)
    ctx.lineTo(-1, 2)
    ctx.lineTo(-8, 30)
    ctx.lineTo(13, -6)
    ctx.lineTo(2, -6)
    ctx.closePath()
    ctx.fill()
  },
  // ring
  (ctx) => {
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 6
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(0, 0, 22, 0, Math.PI * 2)
    ctx.stroke()
  },
  // smoke: a lumpy soft cloud
  (ctx) => {
    for (const [x, y, r] of [
      [0, 0, 22],
      [-11, 5, 15],
      [12, 4, 16],
      [3, -10, 15],
    ]) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,0.8)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  // drop
  (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.moveTo(0, -26)
    ctx.bezierCurveTo(6, -10, 16, 2, 14, 12)
    ctx.bezierCurveTo(12, 26, -12, 26, -14, 12)
    ctx.bezierCurveTo(-16, 2, -6, -10, 0, -26)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(-5, 8, 3, 6, 0.4, 0, Math.PI * 2)
    ctx.fill()
  },
  // petal
  (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(0, 26)
    ctx.bezierCurveTo(22, 10, 18, -20, 6, -24)
    ctx.lineTo(0, -16)
    ctx.lineTo(-6, -24)
    ctx.bezierCurveTo(-18, -20, -22, 10, 0, 26)
    ctx.fill()
  },
  // flake: a six-armed snowflake
  (ctx) => {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    for (let i = 0; i < 6; i += 1) {
      ctx.save()
      ctx.rotate((i / 6) * Math.PI * 2)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -27)
      ctx.moveTo(0, -15)
      ctx.lineTo(-8, -22)
      ctx.moveTo(0, -15)
      ctx.lineTo(8, -22)
      ctx.stroke()
      ctx.restore()
    }
  },
  // heart
  (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(0, 24)
    ctx.bezierCurveTo(-30, 2, -22, -26, 0, -10)
    ctx.bezierCurveTo(22, -26, 30, 2, 0, 24)
    ctx.fill()
  },
  // bubble
  (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(0, 0, 22, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(-8, -9, 6, 4, -0.6, 0, Math.PI * 2)
    ctx.fill()
  },
  // diamond: a faceted gem
  (ctx) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(0, -28)
    ctx.lineTo(20, -6)
    ctx.lineTo(0, 28)
    ctx.lineTo(-20, -6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(160,160,180,1)'
    ctx.beginPath()
    ctx.moveTo(0, -28)
    ctx.lineTo(8, -6)
    ctx.lineTo(0, 28)
    ctx.closePath()
    ctx.fill()
  },
]

let atlas = null
function spriteAtlas() {
  if (atlas) return atlas
  const canvas = document.createElement('canvas')
  canvas.width = COLS * CELL
  canvas.height = ROWS * CELL
  const ctx = canvas.getContext('2d')
  DRAW.forEach((draw, i) => {
    ctx.save()
    ctx.translate((i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2)
    draw(ctx)
    ctx.restore()
  })
  atlas = new CanvasTexture(canvas)
  atlas.generateMipmaps = false
  atlas.minFilter = LinearFilter
  return atlas
}

// ---------------------------------------------------------------------------
// Particle pool
// ---------------------------------------------------------------------------

const MAX = 700

const VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  attribute float size;
  attribute float sprite;
  attribute float rot;
  attribute float squash;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSprite;
  varying float vRot;
  varying float vSquash;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / max(0.2, -mv.z);
    vColor = color;
    vAlpha = alpha;
    vSprite = sprite;
    vRot = rot;
    vSquash = squash;
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSprite;
  varying float vRot;
  varying float vSquash;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    p.y = -p.y;
    float c = cos(vRot);
    float s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    p.x /= max(vSquash, 0.05);
    if (abs(p.x) > 0.5 || abs(p.y) > 0.5) discard;
    float col = mod(vSprite, ${COLS}.0);
    float row = floor(vSprite / ${COLS}.0);
    vec2 uv = (vec2(col, ${ROWS - 1}.0 - row) + p * 0.94 + 0.5) / vec2(${COLS}.0, ${ROWS}.0);
    vec4 t = texture2D(uAtlas, uv);
    float a = t.a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * t.rgb, a);
  }
`

/** Particle modes. */
const FLICKER = 1
const FLAP = 2

/** Scratch spawn description, filled in by the emitters. */
const P = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  life: 1,
  s0: 1,
  s1: 1,
  a0: 1,
  color: new Color(),
  sprite: 0,
  rot: 0,
  spin: 0,
  grav: 0,
  drag: 0,
  mode: 0,
}

class ParticlePool {
  constructor(blending) {
    this.geometry = new BufferGeometry()
    const attr = (name, n) => {
      const a = new BufferAttribute(new Float32Array(MAX * n), n)
      a.setUsage(DynamicDrawUsage)
      this.geometry.setAttribute(name, a)
      return a.array
    }
    this.pos = attr('position', 3)
    this.col = attr('color', 3)
    this.alpha = attr('alpha', 1)
    this.size = attr('size', 1)
    this.sprite = attr('sprite', 1)
    this.rot = attr('rot', 1)
    this.squash = attr('squash', 1)
    this.vel = new Float32Array(MAX * 3)
    this.sim = new Float32Array(MAX * 9) // life, maxLife, s0, s1, a0, spin, grav, drag, mode
    this.seed = new Float32Array(MAX)
    this.count = 0
    this.geometry.setDrawRange(0, 0)
    this.material = new ShaderMaterial({
      uniforms: { uAtlas: { value: spriteAtlas() }, uScale: { value: 500 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending,
    })
    this.points = new Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = blending === AdditiveBlending ? 6 : 5
  }

  spawn() {
    if (this.count >= MAX) return
    const i = this.count
    this.count += 1
    this.pos.set([P.x, P.y, P.z], i * 3)
    this.vel.set([P.vx, P.vy, P.vz], i * 3)
    this.col.set([P.color.r, P.color.g, P.color.b], i * 3)
    this.alpha[i] = 0
    this.size[i] = P.s0
    this.sprite[i] = P.sprite
    this.rot[i] = P.rot
    this.squash[i] = 1
    this.sim.set([0, P.life, P.s0, P.s1, P.a0, P.spin, P.grav, P.drag, P.mode], i * 9)
    this.seed[i] = Math.random() * 100
  }

  /** Swap-remove particle i with the last live one. */
  kill(i) {
    const last = (this.count -= 1)
    if (i === last) return
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3)
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3)
    this.col.copyWithin(i * 3, last * 3, last * 3 + 3)
    this.sim.copyWithin(i * 9, last * 9, last * 9 + 9)
    this.alpha[i] = this.alpha[last]
    this.size[i] = this.size[last]
    this.sprite[i] = this.sprite[last]
    this.rot[i] = this.rot[last]
    this.squash[i] = this.squash[last]
    this.seed[i] = this.seed[last]
  }

  update(dt) {
    const { pos, vel, sim } = this
    for (let i = 0; i < this.count; ) {
      const k = i * 9
      sim[k] += dt
      const life = sim[k]
      if (life >= sim[k + 1]) {
        this.kill(i)
        continue
      }
      const t = life / sim[k + 1]
      const j = i * 3
      vel[j + 1] += sim[k + 6] * dt
      const damp = Math.max(0, 1 - sim[k + 7] * dt)
      vel[j] *= damp
      vel[j + 1] *= damp
      vel[j + 2] *= damp
      pos[j] += vel[j] * dt
      pos[j + 1] += vel[j + 1] * dt
      pos[j + 2] += vel[j + 2] * dt
      this.rot[i] += sim[k + 5] * dt
      this.size[i] = sim[k + 2] + (sim[k + 3] - sim[k + 2]) * t
      let a = sim[k + 4] * Math.min(1, t * 10) * (1 - t) * (1 - t * 0.3)
      const mode = sim[k + 8]
      if (mode === FLICKER) a *= 0.5 + 0.5 * Math.sin(life * 28 + this.seed[i])
      if (mode === FLAP) this.squash[i] = 0.2 + 0.8 * Math.abs(Math.sin(life * 14 + this.seed[i]))
      this.alpha[i] = a
      i += 1
    }
    this.geometry.setDrawRange(0, this.count)
    const a = this.geometry.attributes
    for (const name of ['position', 'color', 'alpha', 'size', 'sprite', 'rot', 'squash']) a[name].needsUpdate = true
  }
}

// ---------------------------------------------------------------------------
// Effect kinds: layers of particles, each emitted from somewhere on the runner.
//
//   at      feet | behind (body height, just behind) | body (all round) | orbit (spiral)
//   rate    particles per second at a normal run
//   idle    fraction of the rate kept while standing still (auras)
//   life    [min, max] seconds;  size: [start, end] metres
//   up / back   [min, max] speed upward / backward;  spread: random speed
//   grav, drag, spin, alpha, c (palette index), mode: 'flicker' | 'flap'
// ---------------------------------------------------------------------------

const KINDS = {
  dust: [
    { sprite: 'smoke', rate: 18, at: 'feet', life: [0.35, 0.6], size: [0.35, 0.9], up: [0.3, 0.8], back: [0.4, 1], spread: 0.6, alpha: 0.7 },
    { sprite: 'star', add: true, rate: 8, at: 'feet', life: [0.4, 0.7], size: [0.35, 0.05], up: [0.6, 1.6], spread: 0.7, c: 1, mode: 'flicker' },
  ],
  shadow: [
    { sprite: 'smoke', rate: 22, at: 'feet', life: [0.5, 0.8], size: [0.45, 1.1], up: [0.2, 0.6], back: [0.2, 0.6], spread: 0.4, alpha: 0.85 },
    { sprite: 'dot', add: true, rate: 9, at: 'feet', life: [0.4, 0.7], size: [0.18, 0.04], up: [0.8, 1.8], spread: 0.8, c: 1 },
  ],
  sparkle: [
    { sprite: 'star', add: true, rate: 16, at: 'behind', life: [0.4, 0.8], size: [0.4, 0.05], up: [0.2, 0.9], spread: 0.6, mode: 'flicker' },
    { sprite: 'star', add: true, rate: 7, at: 'feet', life: [0.4, 0.7], size: [0.3, 0.05], up: [0.8, 1.6], spread: 0.6, c: 1, mode: 'flicker' },
    { sprite: 'smoke', rate: 8, at: 'feet', life: [0.35, 0.6], size: [0.3, 0.7], up: [0.2, 0.5], spread: 0.5, c: 2, alpha: 0.45 },
  ],
  embers: [
    { sprite: 'dot', add: true, rate: 22, at: 'feet', life: [0.5, 0.9], size: [0.22, 0.05], up: [1, 2.6], spread: 1, drag: 1.5 },
    { sprite: 'crescent', add: true, rate: 3, at: 'behind', life: [0.18, 0.28], size: [0.9, 1.3], spread: 0.2, c: 1, rot: true },
    { sprite: 'smoke', rate: 8, at: 'feet', life: [0.4, 0.7], size: [0.35, 0.9], up: [0.3, 0.7], spread: 0.4, c: 2, alpha: 0.6 },
  ],
  stars: [
    { sprite: 'star', add: true, rate: 12, at: 'behind', life: [0.4, 0.8], size: [0.45, 0.05], up: [0.2, 1], spread: 0.8, mode: 'flicker' },
    { sprite: 'star', add: true, rate: 8, at: 'feet', life: [0.4, 0.8], size: [0.35, 0.05], up: [0.6, 1.8], spread: 0.8, c: 1 },
    { sprite: 'ring', add: true, rate: 2.2, at: 'feet', life: [0.3, 0.45], size: [0.2, 1.6], c: 2, alpha: 0.7 },
    { sprite: 'smoke', rate: 8, at: 'feet', life: [0.3, 0.5], size: [0.3, 0.7], up: [0.2, 0.5], spread: 0.5, c: 2, alpha: 0.4 },
  ],
  electric: [
    { sprite: 'bolt', add: true, rate: 14, at: 'feet', idle: 0.2, life: [0.08, 0.16], size: [0.8, 0.5], spread: 0.3, rot: true },
    { sprite: 'bolt', add: true, rate: 6, at: 'body', idle: 0.3, life: [0.08, 0.14], size: [0.6, 0.4], c: 1, rot: true },
    { sprite: 'dot', add: true, rate: 26, at: 'feet', life: [0.25, 0.5], size: [0.18, 0.03], up: [1.5, 3.5], back: [2, 4], spread: 1.6, grav: -14 },
    { sprite: 'ring', add: true, rate: 2.2, at: 'feet', life: [0.25, 0.4], size: [0.3, 1.8], c: 2, alpha: 0.6 },
    { sprite: 'smoke', rate: 6, at: 'feet', life: [0.3, 0.5], size: [0.3, 0.7], up: [0.2, 0.5], spread: 0.5, c: 2, alpha: 0.35 },
  ],
  flame: [
    { sprite: 'flame', add: true, rate: 30, at: 'feet', life: [0.35, 0.6], size: [0.7, 0.15], up: [1.5, 3], spread: 0.5, rot: 0.3 },
    { sprite: 'flame', add: true, rate: 12, at: 'behind', life: [0.3, 0.5], size: [0.9, 0.2], up: [1, 2], spread: 0.4, c: 1, rot: 0.3 },
    { sprite: 'dot', add: true, rate: 12, at: 'feet', life: [0.6, 1], size: [0.16, 0.04], up: [1.5, 3.5], spread: 1.2, c: 2, drag: 1 },
    { sprite: 'smoke', rate: 5, at: 'feet', life: [0.5, 0.8], size: [0.4, 1], up: [0.8, 1.4], spread: 0.3, color: '#2a1a14', alpha: 0.5 },
  ],
  chakra: [
    { sprite: 'dot', add: true, rate: 36, at: 'orbit', life: [0.4, 0.7], size: [0.35, 0.08], up: [0.2, 0.5], spread: 0.1 },
    { sprite: 'leaf', rate: 6, at: 'behind', life: [0.8, 1.3], size: [0.35, 0.3], up: [0.4, 1.2], spread: 1, c: 1, spin: 5, grav: -1.5 },
    { sprite: 'smoke', rate: 10, at: 'feet', life: [0.35, 0.6], size: [0.35, 0.9], up: [0.2, 0.6], spread: 0.5, c: 2, alpha: 0.5 },
    { sprite: 'flame', add: true, rate: 10, at: 'body', idle: 0.25, life: [0.3, 0.5], size: [0.5, 0.1], up: [1, 2], spread: 0.2 },
  ],
  water: [
    { sprite: 'drop', add: true, rate: 22, at: 'feet', life: [0.5, 0.8], size: [0.28, 0.12], up: [2, 4], back: [0.5, 1.5], spread: 1, grav: -12 },
    { sprite: 'dot', add: true, rate: 30, at: 'orbit', life: [0.5, 0.8], size: [0.4, 0.1], up: [0.1, 0.3], c: 1 },
    { sprite: 'ring', add: true, rate: 3, at: 'feet', life: [0.35, 0.5], size: [0.3, 1.8], c: 2, alpha: 0.6 },
    { sprite: 'smoke', rate: 8, at: 'feet', life: [0.3, 0.5], size: [0.3, 0.8], up: [0.3, 0.8], spread: 0.5, c: 2, alpha: 0.5 },
  ],
  butterfly: [
    { sprite: 'butterfly', add: true, rate: 7, at: 'body', idle: 0.3, life: [1.2, 1.9], size: [0.45, 0.3], up: [0.3, 0.9], spread: 0.8, mode: 'flap', drag: 0.8 },
    { sprite: 'butterfly', add: true, rate: 3, at: 'behind', life: [1, 1.6], size: [0.35, 0.25], up: [0.3, 0.8], spread: 0.8, c: 1, mode: 'flap', drag: 0.8 },
    { sprite: 'star', add: true, rate: 12, at: 'behind', life: [0.4, 0.8], size: [0.3, 0.05], up: [0.2, 0.8], spread: 0.6, c: 2, mode: 'flicker' },
    { sprite: 'petal', rate: 6, at: 'feet', life: [0.8, 1.2], size: [0.22, 0.2], up: [0.8, 1.6], spread: 0.8, c: 2, spin: 4, grav: -2 },
  ],
  wind: [
    { sprite: 'crescent', add: true, rate: 9, at: 'behind', life: [0.18, 0.3], size: [1, 1.7], spread: 0.3, rot: true, alpha: 0.9 },
    { sprite: 'smoke', rate: 18, at: 'feet', life: [0.3, 0.5], size: [0.4, 1.1], back: [2, 4], spread: 1, c: 1, alpha: 0.55 },
    { sprite: 'dot', add: true, rate: 8, at: 'behind', life: [0.3, 0.5], size: [0.2, 0.05], back: [1, 3], spread: 1, c: 2 },
    { sprite: 'ring', add: true, rate: 2.5, at: 'feet', life: [0.25, 0.4], size: [0.3, 2], alpha: 0.5 },
  ],
  monarch: [
    { sprite: 'smoke', rate: 26, at: 'body', idle: 0.4, life: [0.6, 1], size: [0.5, 1.2], up: [0.6, 1.4], spread: 0.3, alpha: 0.75 },
    { sprite: 'flame', add: true, rate: 22, at: 'body', idle: 0.5, life: [0.35, 0.6], size: [0.6, 0.15], up: [1.2, 2.4], spread: 0.2, c: 1, rot: 0.2 },
    { sprite: 'star', add: true, rate: 8, at: 'behind', life: [0.4, 0.7], size: [0.35, 0.05], up: [0.3, 1], spread: 0.6, c: 2, mode: 'flicker' },
    { sprite: 'ring', add: true, rate: 2, at: 'feet', life: [0.4, 0.6], size: [0.4, 2.2], c: 1, alpha: 0.6 },
  ],
  blackflash: [
    { sprite: 'bolt', add: true, rate: 12, at: 'body', idle: 0.3, life: [0.1, 0.18], size: [0.9, 0.7], spread: 0.2, rot: true },
    { sprite: 'bolt', rate: 7, at: 'body', idle: 0.3, life: [0.12, 0.2], size: [0.8, 0.6], spread: 0.2, c: 1, rot: true },
    { sprite: 'smoke', rate: 12, at: 'feet', life: [0.4, 0.7], size: [0.4, 1], up: [0.3, 0.8], spread: 0.4, c: 1, alpha: 0.7 },
    { sprite: 'ring', add: true, rate: 2.5, at: 'behind', life: [0.25, 0.35], size: [0.3, 1.8], alpha: 0.8 },
    { sprite: 'dot', add: true, rate: 10, at: 'feet', life: [0.3, 0.6], size: [0.2, 0.04], up: [1, 2.5], spread: 1.4, c: 2 },
  ],
  aura: [
    { sprite: 'flame', add: true, rate: 34, at: 'body', idle: 0.7, life: [0.35, 0.6], size: [0.6, 0.12], up: [1.6, 3], spread: 0.2, rot: 0.2, alpha: 0.6 },
    { sprite: 'dot', add: true, rate: 18, at: 'body', idle: 0.5, life: [0.4, 0.7], size: [0.2, 0.04], up: [2, 4], spread: 0.6, c: 1 },
    { sprite: 'bolt', add: true, rate: 3, at: 'body', idle: 0.6, life: [0.08, 0.14], size: [0.7, 0.5], c: 2, rot: true },
    { sprite: 'ring', add: true, rate: 2.5, at: 'feet', life: [0.35, 0.5], size: [0.5, 2.4], c: 1, alpha: 0.7 },
    { sprite: 'smoke', rate: 8, at: 'feet', life: [0.3, 0.6], size: [0.4, 1], up: [0.3, 0.8], spread: 0.8, c: 1, alpha: 0.4 },
  ],
  gear: [
    { sprite: 'smoke', rate: 30, at: 'body', idle: 0.5, life: [0.6, 1], size: [0.4, 1.3], up: [1, 2], spread: 0.3, alpha: 0.6 },
    { sprite: 'dot', add: true, rate: 12, at: 'body', idle: 0.3, life: [0.4, 0.7], size: [0.22, 0.05], up: [1.5, 3], spread: 0.5, c: 1 },
    { sprite: 'ring', add: true, rate: 2.5, at: 'feet', life: [0.3, 0.45], size: [0.4, 2.2], c: 1, alpha: 0.6 },
    { sprite: 'star', add: true, rate: 6, at: 'behind', life: [0.3, 0.6], size: [0.35, 0.05], up: [0.3, 1], spread: 0.6, c: 2, mode: 'flicker' },
  ],
  crow: [
    { sprite: 'feather', rate: 14, at: 'behind', idle: 0.2, life: [1, 1.6], size: [0.45, 0.35], up: [0.2, 1], spread: 1, spin: 3, grav: -1.2, drag: 1 },
    { sprite: 'dot', add: true, rate: 10, at: 'behind', life: [0.3, 0.6], size: [0.22, 0.04], up: [0.3, 1.2], spread: 0.8, c: 1 },
    { sprite: 'smoke', rate: 14, at: 'feet', life: [0.5, 0.8], size: [0.4, 1.1], up: [0.3, 0.8], spread: 0.4, alpha: 0.7 },
    { sprite: 'flame', add: true, rate: 10, at: 'body', idle: 0.4, life: [0.3, 0.5], size: [0.5, 0.1], up: [1, 2], spread: 0.2, c: 1 },
  ],
  thunder: [
    { sprite: 'bolt', add: true, rate: 20, at: 'feet', idle: 0.3, life: [0.08, 0.16], size: [0.9, 0.6], spread: 0.3, rot: true },
    { sprite: 'bolt', add: true, rate: 8, at: 'body', idle: 0.4, life: [0.08, 0.14], size: [0.8, 0.5], c: 1, rot: true },
    { sprite: 'dot', add: true, rate: 28, at: 'feet', life: [0.25, 0.5], size: [0.2, 0.04], up: [1, 3], back: [1, 3], spread: 2, c: 1 },
    { sprite: 'ring', add: true, rate: 3, at: 'feet', life: [0.25, 0.4], size: [0.4, 2.4], alpha: 0.8 },
    { sprite: 'flame', add: true, rate: 14, at: 'body', idle: 0.5, life: [0.3, 0.5], size: [0.5, 0.1], up: [1.2, 2.2], spread: 0.2, c: 2 },
  ],
  hellfire: [
    { sprite: 'flame', add: true, rate: 32, at: 'body', idle: 0.7, life: [0.35, 0.6], size: [0.6, 0.12], up: [1.6, 3], spread: 0.2, rot: 0.2, alpha: 0.65 },
    { sprite: 'flame', add: true, rate: 22, at: 'feet', life: [0.35, 0.6], size: [0.8, 0.2], up: [1, 2.5], spread: 0.6, c: 1 },
    { sprite: 'smoke', rate: 16, at: 'feet', idle: 0.3, life: [0.6, 1], size: [0.5, 1.3], up: [0.8, 1.6], spread: 0.4, c: 2, alpha: 0.7 },
    { sprite: 'dot', add: true, rate: 16, at: 'body', idle: 0.4, life: [0.5, 0.9], size: [0.18, 0.04], up: [2, 4], spread: 1, c: 1, drag: 1 },
    { sprite: 'ring', add: true, rate: 2, at: 'feet', life: [0.4, 0.6], size: [0.5, 2.6], alpha: 0.6 },
  ],
  frost: [
    { sprite: 'flake', add: true, rate: 16, at: 'behind', life: [0.6, 1.1], size: [0.4, 0.2], up: [0.2, 0.8], spread: 0.8, spin: 3, mode: 'flicker' },
    { sprite: 'diamond', add: true, rate: 8, at: 'feet', life: [0.4, 0.7], size: [0.35, 0.1], up: [1, 2.4], spread: 1, c: 1, rot: true, grav: -6 },
    { sprite: 'smoke', rate: 12, at: 'feet', life: [0.4, 0.8], size: [0.4, 1.1], up: [0.1, 0.4], spread: 0.6, alpha: 0.55 },
    { sprite: 'ring', add: true, rate: 2, at: 'feet', life: [0.35, 0.5], size: [0.3, 1.8], c: 2, alpha: 0.6 },
  ],
  sakura: [
    { sprite: 'petal', rate: 18, at: 'behind', idle: 0.25, life: [1, 1.6], size: [0.3, 0.25], up: [0.4, 1.2], spread: 1.2, spin: 5, grav: -1.4, drag: 0.8 },
    { sprite: 'petal', rate: 8, at: 'body', idle: 0.3, life: [1, 1.5], size: [0.25, 0.2], up: [0.2, 0.8], spread: 0.8, c: 1, spin: 4, grav: -1 },
    { sprite: 'star', add: true, rate: 8, at: 'feet', life: [0.4, 0.7], size: [0.3, 0.05], up: [0.6, 1.4], spread: 0.6, c: 2, mode: 'flicker' },
    { sprite: 'crescent', add: true, rate: 2.5, at: 'behind', life: [0.18, 0.28], size: [0.9, 1.4], spread: 0.2, c: 1, rot: true },
  ],
  toxic: [
    { sprite: 'bubble', add: true, rate: 18, at: 'feet', idle: 0.2, life: [0.6, 1.1], size: [0.15, 0.45], up: [0.8, 1.8], spread: 0.7, drag: 1 },
    { sprite: 'smoke', rate: 16, at: 'feet', life: [0.5, 0.9], size: [0.4, 1.2], up: [0.3, 0.7], spread: 0.5, c: 1, alpha: 0.6 },
    { sprite: 'drop', add: true, rate: 10, at: 'feet', life: [0.4, 0.7], size: [0.25, 0.1], up: [1.5, 3], spread: 1.2, grav: -10, c: 2 },
    { sprite: 'flame', add: true, rate: 8, at: 'body', idle: 0.3, life: [0.3, 0.5], size: [0.45, 0.1], up: [1, 2], spread: 0.2 },
  ],
  moon: [
    { sprite: 'crescent', add: true, rate: 8, at: 'behind', idle: 0.2, life: [0.5, 0.9], size: [0.5, 0.3], up: [0.2, 0.8], spread: 0.6, spin: 2 },
    { sprite: 'star', add: true, rate: 16, at: 'body', idle: 0.4, life: [0.5, 0.9], size: [0.35, 0.05], up: [0.3, 1], spread: 0.5, c: 2, mode: 'flicker' },
    { sprite: 'smoke', rate: 12, at: 'feet', life: [0.5, 0.9], size: [0.4, 1.1], up: [0.2, 0.6], spread: 0.5, c: 1, alpha: 0.6 },
    { sprite: 'ring', add: true, rate: 2, at: 'feet', life: [0.4, 0.6], size: [0.4, 2], c: 0, alpha: 0.6 },
  ],
  rainbow: [
    { sprite: 'star', add: true, rate: 22, at: 'behind', idle: 0.3, life: [0.5, 0.9], size: [0.4, 0.05], up: [0.2, 1], spread: 0.8, c: 'any', mode: 'flicker' },
    { sprite: 'heart', add: true, rate: 8, at: 'body', idle: 0.3, life: [0.7, 1.1], size: [0.35, 0.25], up: [0.6, 1.4], spread: 0.6, c: 'any' },
    { sprite: 'dot', add: true, rate: 30, at: 'orbit', idle: 0.4, life: [0.4, 0.7], size: [0.35, 0.08], up: [0.2, 0.5], spread: 0.1, c: 'any' },
    { sprite: 'ring', add: true, rate: 3, at: 'feet', life: [0.35, 0.5], size: [0.4, 2.4], c: 'any', alpha: 0.7 },
  ],
  galaxy: [
    { sprite: 'star', add: true, rate: 26, at: 'body', idle: 0.5, life: [0.5, 1], size: [0.35, 0.05], up: [0.2, 1], spread: 0.6, c: 'any', mode: 'flicker' },
    { sprite: 'smoke', add: true, rate: 18, at: 'behind', idle: 0.3, life: [0.6, 1], size: [0.5, 1.4], up: [0.2, 0.6], spread: 0.4, c: 'any', alpha: 0.45 },
    { sprite: 'dot', add: true, rate: 34, at: 'orbit', idle: 0.5, life: [0.5, 0.8], size: [0.3, 0.06], up: [0.1, 0.3], c: 2 },
    { sprite: 'ring', add: true, rate: 2.5, at: 'feet', life: [0.4, 0.6], size: [0.4, 2.6], c: 1, alpha: 0.6 },
  ],
  divine: [
    { sprite: 'flame', add: true, rate: 34, at: 'body', idle: 0.7, life: [0.35, 0.6], size: [0.6, 0.12], up: [1.6, 3], spread: 0.2, rot: 0.2, alpha: 0.65 },
    { sprite: 'flame', add: true, rate: 20, at: 'feet', life: [0.35, 0.6], size: [0.8, 0.2], up: [1, 2.5], spread: 0.6, c: 1 },
    { sprite: 'star', add: true, rate: 14, at: 'behind', idle: 0.4, life: [0.5, 0.9], size: [0.4, 0.05], up: [0.3, 1.2], spread: 0.6, c: 2, mode: 'flicker' },
    { sprite: 'bolt', add: true, rate: 4, at: 'body', idle: 0.6, life: [0.08, 0.14], size: [0.8, 0.6], c: 2, rot: true },
    { sprite: 'ring', add: true, rate: 2.5, at: 'feet', life: [0.4, 0.6], size: [0.5, 2.8], alpha: 0.7 },
  ],
}

/**
 * Sparks sprayed back and up from the feet, arcing down: added to every kind,
 * in its accent colour, so every character throws off fire / electric sparks.
 */
const SPRAY = { sprite: 'dot', add: true, rate: 14, at: 'feet', life: [0.3, 0.55], size: [0.17, 0.03], up: [1.2, 3], back: [2, 4.5], spread: 1.4, grav: -12, c: 1 }

const rand = (a, b) => a + Math.random() * (b - a)

/** Everything about the equipped anime's effect, precomputed. */
function buildRecipe(anime) {
  // Pricier characters rank higher (the avatar is rank 0).
  const rank = anime.avatar ? 0 : ANIMES.indexOf(anime) + 1
  const palette = (anime.fx?.colors || ['#ffffff']).map((c) => new Color(c))
  const layers = [...(KINDS[anime.fx?.kind] || KINDS.dust), SPRAY].map((l) => ({
    ...l,
    sprite: SPRITE[l.sprite],
    color: l.color ? new Color(l.color) : palette[l.c === 'any' ? 0 : Math.min(l.c ?? 0, palette.length - 1)],
    any: l.c === 'any',
    mode: l.mode === 'flicker' ? FLICKER : l.mode === 'flap' ? FLAP : 0,
    acc: 0,
  }))
  return {
    layers,
    palette,
    // Pricier characters: more particles, bigger ones (the free ones still show).
    power: 0.8 + rank * 0.07,
    scale: 1 + rank * 0.025,
    rank,
    ghost: anime.ghost ? new Color(anime.ghost) : null,
  }
}

// ---------------------------------------------------------------------------
// Afterimages: glowing silhouettes posed like the runner at that instant.
// ---------------------------------------------------------------------------

const GHOSTS = 6
const GHOST_LIFE = 0.32
const GHOST_EVERY = 0.055

function buildGhost() {
  const material = new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 })
  const root = new Group()
  root.matrixAutoUpdate = false
  const part = (parent, size, pos) => {
    const m = new Mesh(unitBox, material)
    m.scale.set(...size)
    m.position.set(...pos)
    parent.add(m)
  }
  const joint = (pos) => {
    const g = new Group()
    g.position.set(...pos)
    root.add(g)
    return g
  }
  const legs = [-1, 1].map((s) => joint([s * 0.18, 0.72, 0]))
  for (const l of legs) part(l, [0.36, 0.72, 0.38], [0, -0.36, 0])
  const arms = [-1, 1].map((s) => joint([s * 0.54, 1.38, 0]))
  for (const a of arms) part(a, [0.34, 0.72, 0.34], [0, -0.32, 0])
  part(root, [0.72, 0.72, 0.36], [0, 1.08, 0])
  part(root, [0.5, 0.5, 0.5], [0, 1.72, 0])
  root.visible = false
  return { root, legs, arms, material, life: 0 }
}

// ---------------------------------------------------------------------------

const _feet = new Vector3()
const _dir = new Vector3(0, 0, -1)
const _side = new Vector3()
const _buf = new Vector2()

class RunEffects {
  /** `src` is what to follow: the local runtime, or another player's stand-in. */
  constructor(src = runtime) {
    this.src = src
    this.last = new Vector3().copy(src.playerPos)
    this.dir = new Vector3(0, 0, -1)
    this.add = new ParticlePool(AdditiveBlending)
    this.normal = new ParticlePool(NormalBlending)
    this.ghosts = Array.from({ length: GHOSTS }, buildGhost)
    this.group = new Group()
    this.group.add(this.normal.points, this.add.points)
    for (const g of this.ghosts) this.group.add(g.root)
    this.recipe = null
    this.ghostTimer = 0
    this.ghostNext = 0
    this.jumps = this.src.jumps
    this.lands = this.src.lands
    this.teleports = this.src.teleports
    this.orbit = 0
  }

  setAnime(anime) {
    this.recipe = anime ? buildRecipe(anime) : null
  }

  emit(layer, recipe, speed) {
    P.sprite = layer.sprite
    P.color.copy(layer.any ? recipe.palette[Math.floor(Math.random() * recipe.palette.length)] : layer.color)
    const sc = recipe.scale
    P.s0 = layer.size[0] * sc
    P.s1 = layer.size[1] * sc
    P.a0 = layer.alpha ?? 1
    P.life = rand(layer.life[0], layer.life[1])
    P.grav = layer.grav ?? 0
    P.drag = layer.drag ?? 0
    P.mode = layer.mode
    P.spin = layer.spin ? rand(-layer.spin, layer.spin) : 0
    P.rot = layer.rot === true ? rand(0, Math.PI * 2) : layer.rot ? rand(-layer.rot, layer.rot) : 0

    // Where.
    let x = _feet.x
    let y = _feet.y
    let z = _feet.z
    const across = rand(-0.5, 0.5)
    if (layer.at === 'feet') {
      x += _side.x * across * 0.5 - _dir.x * 0.2
      z += _side.z * across * 0.5 - _dir.z * 0.2
      y += 0.08
    } else if (layer.at === 'behind') {
      x += _side.x * across * 0.7 - _dir.x * 0.45
      z += _side.z * across * 0.7 - _dir.z * 0.45
      y += rand(0.3, 1.6)
    } else if (layer.at === 'body') {
      const a = rand(0, Math.PI * 2)
      const r = rand(0.4, 0.62)
      x += Math.cos(a) * r
      z += Math.sin(a) * r
      y += rand(0, 1.9)
    } else {
      // orbit: two strands spiralling up round the body.
      this.orbit += 1
      const strand = this.orbit % 2
      const a = this.src.time * 9 + strand * Math.PI
      x += Math.cos(a) * 0.62
      z += Math.sin(a) * 0.62
      y += 0.2 + ((this.src.time * 1.4 + strand * 0.5) % 1) * 1.6
    }
    P.x = x
    P.y = y
    P.z = z

    // How it moves.
    const up = layer.up ? rand(layer.up[0], layer.up[1]) : 0
    const back = layer.back ? rand(layer.back[0], layer.back[1]) * Math.min(1.5, 0.4 + speed / 12) : 0
    const spread = layer.spread ?? 0
    P.vx = -_dir.x * back + rand(-spread, spread)
    P.vy = up + rand(-spread, spread) * 0.3
    P.vz = -_dir.z * back + rand(-spread, spread)
    ;(layer.add ? this.add : this.normal).spawn()
  }

  /** A ring of puffs round the feet (jumping off / landing). */
  burst(recipe, strength) {
    const n = Math.round((6 + recipe.rank * 0.7) * strength)
    const color = recipe.palette[0]
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2
      P.x = _feet.x + Math.cos(a) * 0.3
      P.y = _feet.y + 0.1
      P.z = _feet.z + Math.sin(a) * 0.3
      P.vx = Math.cos(a) * rand(1.5, 3) * strength
      P.vy = rand(0.2, 0.8)
      P.vz = Math.sin(a) * rand(1.5, 3) * strength
      P.life = rand(0.35, 0.55)
      P.s0 = 0.35 * recipe.scale
      P.s1 = 0.9 * recipe.scale
      P.a0 = 0.6
      P.color.copy(color)
      P.sprite = SPRITE.smoke
      P.rot = rand(0, 6)
      P.spin = 0
      P.grav = 0
      P.drag = 3
      P.mode = 0
      this.normal.spawn()
    }
    if (recipe.rank >= 3) {
      P.x = _feet.x
      P.y = _feet.y + 0.15
      P.z = _feet.z
      P.vx = P.vy = P.vz = 0
      P.life = 0.4
      P.s0 = 0.4
      P.s1 = 3 * recipe.scale
      P.a0 = 0.8
      P.color.copy(recipe.palette[Math.min(1, recipe.palette.length - 1)])
      P.sprite = SPRITE.ring
      P.drag = 0
      this.add.spawn()
    }
  }

  spawnGhost(model, color) {
    const g = this.ghosts[this.ghostNext]
    this.ghostNext = (this.ghostNext + 1) % GHOSTS
    model.root.updateWorldMatrix(true, false)
    g.root.matrix.copy(model.root.matrixWorld)
    g.root.matrixWorldNeedsUpdate = true
    for (let i = 0; i < 2; i += 1) {
      g.legs[i].rotation.copy(model.legs[i].rotation)
      g.arms[i].rotation.copy(model.arms[i].rotation)
    }
    g.material.color.copy(color)
    g.life = 0
    g.root.visible = true
  }

  update(dt, state) {
    const recipe = this.recipe
    // Nothing to emit and nothing left in the air: skip the whole frame's work.
    if ((this.src.dead || this.src.moveSpeed < 0.5) && this.add.count + this.normal.count === 0 && !this.ghosts.some((g) => g.root.visible)) {
      this.last.copy(this.src.playerPos)
      return
    }
    const p = this.src.playerPos
    _dir.copy(this.dir)
    _feet.set(p.x, p.y - 0.9, p.z)
    // Direction of travel from the last frame (kept when standing still).
    const dx = p.x - this.last.x
    const dz = p.z - this.last.z
    const moved = Math.hypot(dx, dz)
    const teleported = this.src.teleports !== this.teleports
    this.teleports = this.src.teleports
    if (moved > 0.01 && !teleported) _dir.set(dx / moved, 0, dz / moved)
    _side.set(_dir.z, 0, -_dir.x)
    this.last.copy(p)
    this.dir.copy(_dir)

    // Size points for the current viewport.
    state.gl.getDrawingBufferSize(_buf)
    const scale = _buf.y * 0.5 * state.camera.projectionMatrix.elements[5]
    this.add.material.uniforms.uScale.value = scale
    this.normal.material.uniforms.uScale.value = scale

    if (recipe && !this.src.dead && !teleported) {
      const speed = this.src.moveSpeed
      const running = speed > 1.5
      const move = running ? Math.min(2.2, Math.max(0.5, speed / 7)) * (this.src.grounded ? 1 : 0.6) : 0
      for (const layer of recipe.layers) {
        const rate = layer.rate * recipe.power * Math.max(move, layer.idle ?? 0)
        layer.acc += rate * dt
        // Cap per frame so a hitch never dumps a wall of particles.
        let n = Math.min(12, Math.floor(layer.acc))
        layer.acc -= Math.floor(layer.acc)
        while (n-- > 0) this.emit(layer, recipe, speed)
      }
      if (this.src.jumps !== this.jumps) this.burst(recipe, 0.8)
      if (this.src.lands !== this.lands) this.burst(recipe, 1)

      // Afterimages for the strongest characters once they're really moving.
      const model = this.src.playerModel
      if (recipe.ghost && model && speed > 7) {
        this.ghostTimer += dt
        if (this.ghostTimer >= GHOST_EVERY) {
          this.ghostTimer = 0
          this.spawnGhost(model, recipe.ghost)
        }
      }
    }
    this.jumps = this.src.jumps
    this.lands = this.src.lands

    for (const g of this.ghosts) {
      if (!g.root.visible) continue
      g.life += dt
      const t = g.life / GHOST_LIFE
      if (t >= 1 || this.src.dead) g.root.visible = false
      else g.material.opacity = 0.42 * (1 - t) * (1 - t)
    }
    this.add.update(dt)
    this.normal.update(dt)
  }
}

/**
 * A character's running effect. With no props it follows the local player and the
 * anime they wear; for another player pass their stand-in `src` (see
 * RemotePlayers.jsx) and `animeId`.
 */
export function RunFx({ src, animeId: forcedId }) {
  const stored = useGame((s) => s.equipped)
  const animeId = forcedId ?? stored
  const fx = useMemo(() => new RunEffects(src || runtime), [src])
  useEffect(() => fx.setAnime(characterById(animeId)), [fx, animeId])
  useFrame((state, dt) => {
    if (!src) runtime.time = state.clock.elapsedTime
    else src.time = state.clock.elapsedTime
    fx.update(Math.min(dt, 0.05), state)
  })
  return <primitive object={fx.group} />
}

export default RunFx
