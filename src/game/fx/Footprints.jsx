import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'

import { characterById } from '../config'
import { runtime } from '../runtime'
import { useGame } from '../store'

/**
 * Glowing footprints left on the path, one shape and colour per character:
 * shoe prints for your avatar, stars for the idol, lightning bolts for the
 * thunder knight, snowflakes, flames, flowers, paws, moons, hearts... They glow
 * bright as they land, then fade away.
 */

const SHAPES = ['shoe', 'star', 'bolt', 'flake', 'flame', 'flower', 'drop', 'paw', 'moon', 'heart']
const COLS = 4
const ROWS = 3
const CELL = 128
const POOL = 140
const LIFE = 3.4

function drawShape(ctx, shape) {
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  switch (shape) {
    case 'shoe':
      // A sneaker sole: toe pad and heel.
      ctx.beginPath()
      ctx.ellipse(0, -14, 19, 30, 0.08, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(2, 34, 14, 17, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'star':
      ctx.beginPath()
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2
        const r = i % 2 ? 18 : 42
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fill()
      break
    case 'bolt':
      ctx.beginPath()
      ctx.moveTo(10, -48)
      ctx.lineTo(-20, 4)
      ctx.lineTo(-2, 4)
      ctx.lineTo(-12, 48)
      ctx.lineTo(22, -10)
      ctx.lineTo(4, -10)
      ctx.closePath()
      ctx.fill()
      break
    case 'flake':
      ctx.lineWidth = 7
      ctx.lineCap = 'round'
      for (let i = 0; i < 6; i += 1) {
        ctx.save()
        ctx.rotate((i / 6) * Math.PI * 2)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(0, -42)
        ctx.moveTo(0, -24)
        ctx.lineTo(-12, -36)
        ctx.moveTo(0, -24)
        ctx.lineTo(12, -36)
        ctx.stroke()
        ctx.restore()
      }
      break
    case 'flame':
      ctx.beginPath()
      ctx.moveTo(0, -48)
      ctx.bezierCurveTo(14, -20, 34, -4, 26, 22)
      ctx.bezierCurveTo(20, 44, -20, 44, -26, 22)
      ctx.bezierCurveTo(-32, 0, -10, -16, 0, -48)
      ctx.fill()
      break
    case 'flower':
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2
        ctx.beginPath()
        ctx.ellipse(Math.cos(a) * 20, Math.sin(a) * 20, 16, 11, a, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'drop':
      ctx.beginPath()
      ctx.moveTo(0, -46)
      ctx.bezierCurveTo(12, -20, 30, 0, 26, 18)
      ctx.bezierCurveTo(22, 46, -22, 46, -26, 18)
      ctx.bezierCurveTo(-30, 0, -12, -20, 0, -46)
      ctx.fill()
      break
    case 'paw':
      ctx.beginPath()
      ctx.ellipse(0, 16, 22, 18, 0, 0, Math.PI * 2)
      ctx.fill()
      for (const [x, y] of [[-26, -8], [-10, -26], [10, -26], [26, -8]]) {
        ctx.beginPath()
        ctx.ellipse(x, y, 9, 11, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'moon':
      ctx.beginPath()
      ctx.arc(0, 0, 38, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(16, -10, 34, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      break
    case 'heart':
      ctx.beginPath()
      ctx.moveTo(0, 38)
      ctx.bezierCurveTo(-48, 6, -34, -40, 0, -16)
      ctx.bezierCurveTo(34, -40, 48, 6, 0, 38)
      ctx.fill()
      break
    default:
      break
  }
}

let atlas = null
function getAtlas() {
  if (atlas) return atlas
  const canvas = document.createElement('canvas')
  canvas.width = COLS * CELL
  canvas.height = ROWS * CELL
  const ctx = canvas.getContext('2d')
  SHAPES.forEach((shape, i) => {
    const cx = (i % COLS) * CELL + CELL / 2
    const cy = Math.floor(i / COLS) * CELL + CELL / 2
    // A soft halo (the glow) under a crisp shape.
    ctx.save()
    ctx.translate(cx, cy)
    ctx.globalAlpha = 0.45
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 18
    drawShape(ctx, shape)
    ctx.restore()
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(0.86, 0.86)
    drawShape(ctx, shape)
    ctx.restore()
  })
  atlas = new CanvasTexture(canvas)
  return atlas
}

const VERT = /* glsl */ `
  attribute float aBirth;
  attribute float aCell;
  attribute vec3 aColor;
  attribute float aRainbow;
  uniform float uTime;
  varying vec2 vUv;
  varying float vA;
  varying vec3 vColor;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    float age = uTime - aBirth;
    float t = age / ${LIFE.toFixed(2)};
    vA = (age < 0.0 || t > 1.0) ? 0.0 : (1.0 - smoothstep(0.55, 1.0, t)) * (0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.25, t)));
    float pop = 1.0 + 0.35 * (1.0 - smoothstep(0.0, 0.12, age));
    float col = mod(aCell, ${COLS}.0);
    float row = floor(aCell / ${COLS}.0);
    vUv = (vec2(col, ${ROWS - 1}.0 - row) + uv) / vec2(${COLS}.0, ${ROWS}.0);
    vColor = mix(aColor, hue(fract(aBirth * 0.37)), aRainbow);
    vec4 world = instanceMatrix * vec4(position * pop, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * world;
  }
`
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vA;
  varying vec3 vColor;
  void main() {
    float m = texture2D(uMap, vUv).a;
    if (m * vA < 0.01) discard;
    vec3 core = mix(vColor, vec3(1.0), smoothstep(0.75, 1.0, m) * 0.5);
    gl_FragColor = vec4(core * 1.4, m * vA);
  }
`

const _o = new Object3D()
const _c = new Color()

export function Footprints() {
  const equipped = useGame((s) => s.equipped)
  const print = characterById(equipped).print || { shape: 'shoe', color: '#ffffff' }

  const mesh = useMemo(() => {
    const geometry = new PlaneGeometry(0.46, 0.62)
    geometry.rotateX(-Math.PI / 2)
    geometry.rotateY(Math.PI)
    const birth = new InstancedBufferAttribute(new Float32Array(POOL).fill(-100), 1)
    const cell = new InstancedBufferAttribute(new Float32Array(POOL), 1)
    const color = new InstancedBufferAttribute(new Float32Array(POOL * 3), 3)
    const rainbow = new InstancedBufferAttribute(new Float32Array(POOL), 1)
    geometry.setAttribute('aBirth', birth)
    geometry.setAttribute('aCell', cell)
    geometry.setAttribute('aColor', color)
    geometry.setAttribute('aRainbow', rainbow)
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMap: { value: getAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    const m = new InstancedMesh(geometry, material, POOL)
    m.frustumCulled = false
    m.renderOrder = 2
    for (let i = 0; i < POOL; i += 1) {
      _o.position.set(0, -1000, 0)
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
    }
    m.userData.next = 0
    return m
  }, [])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    mesh.material.uniforms.uTime.value = time
    const queue = runtime.footprints
    if (!queue.length) return
    const geo = mesh.geometry
    while (queue.length) {
      const f = queue.shift()
      // Another player's prints come with their own shape and colour.
      const pr = f.print || print
      const shape = Math.max(0, SHAPES.indexOf(pr.shape))
      _c.set(pr.color)
      const i = mesh.userData.next
      mesh.userData.next = (i + 1) % POOL
      _o.position.set(f.x, f.y, f.z)
      // Shoe prints alternate left/right; symmetric shapes just turn a little.
      _o.rotation.set(0, f.yaw + (shape === 0 ? 0 : f.side * 0.25), 0)
      _o.scale.set(shape === 0 ? f.side : 1, 1, 1)
      _o.updateMatrix()
      mesh.setMatrixAt(i, _o.matrix)
      geo.attributes.aBirth.array[i] = time
      geo.attributes.aCell.array[i] = shape
      geo.attributes.aColor.array.set([_c.r, _c.g, _c.b], i * 3)
      geo.attributes.aRainbow.array[i] = pr.rainbow ? 1 : 0
    }
    mesh.instanceMatrix.needsUpdate = true
    geo.attributes.aBirth.needsUpdate = true
    geo.attributes.aCell.needsUpdate = true
    geo.attributes.aColor.needsUpdate = true
    geo.attributes.aRainbow.needsUpdate = true
  })

  return <primitive object={mesh} />
}

export default Footprints
