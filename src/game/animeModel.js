import {
  BackSide,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Quaternion,
  RedFormat,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { clothTexture, faceTexture } from './animeTextures'
import { unitBox, unitCone } from './materials'

/**
 * Blocky R6-style anime characters, like the ones on the original's ANIME stand.
 *
 * Proportions follow a Roblox R6 rig scaled to our 1.8m player (1 stud = 0.36m):
 * legs 2 studs, torso 2x2x1, arms 1x2x1, a rounded cylinder head. The model faces +Z
 * with its feet at y=0.
 *
 * `look` fields:
 *   skin, face {eyes, marks, whiskers, scar, covered, grin, angry}
 *   hair {style, color, color2, size}
 *   shirt / sleeves / pants: {color, pattern?, color2?}  (Roblox shirt + pants)
 *   haori: {pattern, color, color2}  open coat over the shirt (Demon Slayer style)
 *   collar (high collar colour), hood (big hood colour), belt, gloves, shoes
 *   blindfold, headband, horns, cape, hat
 *   coat {color, pattern?, color2?}  long coat tails that stream out behind at speed
 *   scarf (colour; its tails stream too), wristbands, goggles, earrings, mask
 *   run: 'sprint' | 'ninja' | 'cool' | 'brawler'  (see RUN_STYLES)
 *
 * Everything is cel-shaded (toon material, three flat tones) with a dark outline
 * round the body parts, for the anime look.
 */

// Cylinder head. thetaStart = PI puts u=0.5 (the face) at the front (+Z).
const HEAD_RADIUS = 0.25
const HEAD_HEIGHT = 0.44
const headGeometry = new CylinderGeometry(HEAD_RADIUS, HEAD_RADIUS, HEAD_HEIGHT, 28, 1, false, Math.PI)
const bandGeometry = new CylinderGeometry(1, 1, 1, 28, 1, false, Math.PI)
const capGeometry = new SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)

/** Three flat light bands: shadow, mid, lit. */
const toonRamp = new DataTexture(new Uint8Array([120, 190, 255]), 3, 1, RedFormat)
toonRamp.minFilter = NearestFilter
toonRamp.magFilter = NearestFilter
toonRamp.needsUpdate = true

/** Inverted-hull outline: the back faces of a slightly bigger copy, in ink. */
const OUTLINE = new MeshBasicMaterial({ color: '#160c22', side: BackSide })
const OUTLINE_PAD = 0.05

const materialCache = new Map()
function mat(color, map, emissive) {
  const key = `${color}|${map?.uuid ?? ''}|${emissive ?? ''}`
  if (!materialCache.has(key)) {
    const material = new MeshToonMaterial({ color: map ? '#ffffff' : color, gradientMap: toonRamp })
    if (map) material.map = map
    if (emissive) {
      material.emissive.set(emissive)
      material.emissiveIntensity = 0.9
    }
    materialCache.set(key, material)
  }
  return materialCache.get(key)
}

/** Darken a hex colour by factor f (0..1). */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const clothMat = (cloth, opts) =>
  cloth.pattern ? mat('#fff', clothTexture(cloth, opts)) : mat(cloth.color)

function box(parent, size, pos, material) {
  const mesh = new Mesh(unitBox, material)
  mesh.scale.set(size[0], size[1], size[2])
  mesh.position.set(pos[0], pos[1], pos[2])
  parent.add(mesh)
  return mesh
}

function cone(parent, radius, height, pos, rot, material) {
  const mesh = new Mesh(unitCone, material)
  mesh.scale.set(radius * 2, height, radius * 2)
  mesh.position.set(pos[0], pos[1], pos[2])
  mesh.rotation.set(rot[0], rot[1], rot[2])
  parent.add(mesh)
  return mesh
}

/** An ink outline box around a part (the limb outlines also cover hand / shoe). */
function outline(parent, size, pos) {
  const mesh = new Mesh(unitBox, OUTLINE)
  mesh.scale.set(size[0] + OUTLINE_PAD, size[1] + OUTLINE_PAD, size[2] + OUTLINE_PAD)
  mesh.position.set(pos[0], pos[1], pos[2])
  mesh.userData.outline = true
  parent.add(mesh)
  return mesh
}

/**
 * A cloth panel hanging from a hinge (cape, coat tail, scarf end). The animator
 * swings it back as the character speeds up; `amp` scales how far.
 */
function flap(parent, size, hinge, material, amp = 1) {
  const pivot = new Group()
  pivot.position.set(hinge[0], hinge[1], hinge[2])
  box(pivot, size, [0, -size[1] / 2, 0], material)
  parent.add(pivot)
  return { pivot, amp, seed: hinge[0] * 7 + hinge[1] * 3 }
}

function band(parent, radius, height, y, material) {
  const mesh = new Mesh(bandGeometry, material)
  mesh.scale.set(radius, height, radius)
  mesh.position.y = y
  parent.add(mesh)
  return mesh
}

// ---------------------------------------------------------------------------
// Hair: spikes scattered over the scalp, aimed per style.
// ---------------------------------------------------------------------------

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const _up = new Vector3(0, 1, 0)
const _dir = new Vector3()
const _q = new Quaternion()
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/**
 * count: spikes, tilt: max angle from vertical, len/rad: spike size,
 * back: how far spikes sweep backward, bangs: short spikes down over the forehead.
 */
const HAIR_STYLES = {
  up: { count: 26, tilt: 1.15, len: [0.26, 0.4], rad: 0.075, back: 0.1, bangs: 0, cap: 0.3 },
  messy: { count: 30, tilt: 1.75, len: [0.3, 0.46], rad: 0.09, back: 0.15, bangs: 4, cap: 0.34 },
  naruto: { count: 26, tilt: 1.45, len: [0.26, 0.38], rad: 0.085, back: 0.1, bangs: 3, cap: 0.32 },
  short: { count: 20, tilt: 1.3, len: [0.1, 0.17], rad: 0.07, back: 0.1, bangs: 3, cap: 0.34 },
  tanjiro: { count: 24, tilt: 1.5, len: [0.14, 0.24], rad: 0.08, back: 0.3, bangs: 4, cap: 0.36 },
  swept: { count: 22, tilt: 1.2, len: [0.26, 0.38], rad: 0.08, back: 0.9, bangs: 0, cap: 0.32 },
  flame: { count: 26, tilt: 1.3, len: [0.3, 0.46], rad: 0.085, back: 0.7, bangs: 2, cap: 0.34 },
}

function addHair(head, hair) {
  const top = HEAD_HEIGHT / 2
  // Glowing hair (Saiyan, demon lord) shines with its own colour.
  const glow = hair.glow ? hair.color : undefined
  const c1 = mat(hair.color, undefined, glow)
  const c1dark = mat(shade(hair.color, 0.82), undefined, glow)
  const c2 = mat(hair.color2 || hair.color, undefined, hair.glow ? hair.color2 || hair.color : undefined)
  const size = hair.size || 1

  // Hair cap over the crown so no skin shows between the spikes.
  const cap = new Mesh(capGeometry, c1)
  cap.scale.set(0.56, 0.34, 0.56)
  cap.position.y = top - 0.06
  head.add(cap)
  // Back of the hair, kept above eye level so a blindfold shows from behind.
  box(head, [0.5, 0.15, 0.12], [0, top - 0.09, -0.2], c1)

  if (hair.style === 'long') {
    // Bob cut with coloured tips (the butterfly pillar).
    box(head, [0.54, 0.46, 0.16], [0, -0.02, -0.2], c1)
    box(head, [0.1, 0.44, 0.4], [0.25, -0.01, -0.02], c1)
    box(head, [0.1, 0.44, 0.4], [-0.25, -0.01, -0.02], c1)
    box(head, [0.55, 0.1, 0.17], [0, -0.24, -0.2], c2)
    box(head, [0.11, 0.1, 0.41], [0.25, -0.23, -0.02], c2)
    box(head, [0.11, 0.1, 0.41], [-0.25, -0.23, -0.02], c2)
    box(head, [0.46, 0.1, 0.1], [0, top - 0.03, 0.2], c1)
    // Butterfly hair clip.
    const clip = mat('#b44bff')
    box(head, [0.02, 0.1, 0.09], [0.26, 0.14, -0.06], clip)
    box(head, [0.02, 0.1, 0.09], [0.26, 0.14, 0.04], clip)
    return
  }

  if (hair.style === 'ponytail') {
    // Long straight bangs framing the face, tied back in a low ponytail.
    box(head, [0.1, 0.4, 0.34], [0.25, 0.0, 0.03], c1)
    box(head, [0.1, 0.4, 0.34], [-0.25, 0.0, 0.03], c1)
    box(head, [0.5, 0.3, 0.12], [0, 0.02, -0.21], c1)
    box(head, [0.12, 0.42, 0.1], [0, -0.26, -0.3], c1dark)
    for (const x of [-0.13, 0, 0.13]) cone(head, 0.06, 0.2, [x, top - 0.08, 0.23], [Math.PI - 0.45, 0, x * 1.4], c1)
    return
  }

  const style = HAIR_STYLES[hair.style] || HAIR_STYLES.up
  const rand = rng(hair.style.length * 7919 + (hair.color.charCodeAt(1) || 0))
  for (let i = 0; i < style.count; i += 1) {
    const t = (i + 0.5) / style.count
    const tilt = Math.sqrt(t) * style.tilt
    const az = i * GOLDEN
    _dir.set(Math.sin(tilt) * Math.sin(az), Math.cos(tilt), Math.sin(tilt) * Math.cos(az))
    // Sweep backward, and keep the face clear.
    _dir.z -= style.back
    if (_dir.z > 0.35 && _dir.y < 0.55) _dir.z *= 0.4
    _dir.normalize()
    const len = (style.len[0] + rand() * (style.len[1] - style.len[0])) * size
    const rad = style.rad * size * (0.8 + rand() * 0.4)
    const base = new Vector3(_dir.x * 0.2, top - 0.1 + _dir.y * 0.1, _dir.z * 0.2)
    // Mix in a darker shade (and the second colour) so the hair has depth.
    const mesh = new Mesh(unitCone, hair.color2 && i % 3 === 1 ? c2 : i % 2 ? c1dark : c1)
    mesh.scale.set(rad * 2, len, rad * 2)
    mesh.quaternion.copy(_q.setFromUnitVectors(_up, _dir))
    mesh.position.copy(base).addScaledVector(_dir, len * 0.45)
    head.add(mesh)
  }
  // Bangs: short spikes hanging down over the forehead.
  for (let i = 0; i < style.bangs; i += 1) {
    const x = (i / Math.max(1, style.bangs - 1) - 0.5) * 0.34
    cone(head, 0.06 * size, 0.18 * size, [x, top - 0.08, 0.23], [Math.PI - 0.5, 0, x * 1.4], c1)
  }
}

// ---------------------------------------------------------------------------

/** Builds the model and returns its root plus the joints the animator swings. */
export function buildAnimeModel(look) {
  const root = new Group()
  const skin = mat(look.skin)
  const shirt = look.shirt || { color: '#333' }
  const sleeves = look.sleeves || look.haori || shirt
  const pants = look.pants || shirt

  const legMat = clothMat(pants)
  const armMat = clothMat(sleeves)
  const shoeMat = mat(look.shoes || '#333')
  const handMat = look.gloves ? mat(look.gloves) : skin

  // Legs, pivoting at the hips.
  const legs = [-1, 1].map((side) => {
    const pivot = new Group()
    pivot.position.set(side * 0.18, 0.72, 0)
    box(pivot, [0.35, 0.6, 0.36], [0, -0.3, 0], legMat)
    box(pivot, [0.36, 0.13, 0.4], [0, -0.655, 0.02], shoeMat)
    outline(pivot, [0.36, 0.72, 0.4], [0, -0.36, 0.02])
    root.add(pivot)
    return pivot
  })

  // Torso. An open haori shows the haori on the sides and back, the uniform
  // down the front.
  const torso = new Group()
  torso.position.set(0, 0.72, 0)
  root.add(torso)
  const torsoMesh = box(torso, [0.72, 0.72, 0.36], [0, 0.36, 0], clothMat(shirt))
  outline(torso, [0.72, 0.72, 0.36], [0, 0.36, 0])
  /** Cloth that streams out behind at speed. */
  const flaps = []
  if (look.haori) {
    const outer = clothMat(look.haori)
    const front = mat('#fff', clothTexture(look.haori, { front: shirt.color }))
    torsoMesh.material = [outer, outer, outer, outer, front, outer]
    box(torso, [0.74, 0.14, 0.38], [0, 0.08, 0], clothMat(look.haori))
  }
  if (look.belt) box(torso, [0.74, 0.08, 0.38], [0, 0.07, 0], mat(look.belt))
  if (look.sword) {
    // Katana slung diagonally across the back, handle over the right shoulder.
    const sword = new Group()
    sword.position.set(0, 0.38, -0.23)
    sword.rotation.z = -0.75
    box(sword, [0.08, 0.95, 0.06], [0, -0.12, 0], mat(look.sword.blade, undefined, look.sword.glow))
    box(sword, [0.24, 0.05, 0.1], [0, 0.37, 0], mat(look.sword.guard || '#d4a82a'))
    box(sword, [0.07, 0.26, 0.07], [0, 0.53, 0], mat(look.sword.handle || '#1a1a1a'))
    torso.add(sword)
  }
  if (look.trim) {
    // Neon trim down the front and round the waist.
    const neon = mat(look.trim, undefined, look.trim)
    box(torso, [0.06, 0.72, 0.02], [0, 0.36, 0.19], neon)
    box(torso, [0.74, 0.05, 0.38], [0, 0.02, 0], neon)
  }
  if (look.cape) {
    const cape = look.cape.pattern ? clothMat(look.cape) : mat(look.cape.color)
    flaps.push(flap(torso, [0.8, 1.02, 0.05], [0, 0.71, -0.21], cape, 0.8))
  }
  if (look.coat) {
    // Two long tails, split up the back so each one flutters on its own.
    const coat = clothMat(look.coat)
    for (const side of [-1, 1]) flaps.push(flap(torso, [0.37, 0.66, 0.04], [side * 0.185, 0.14, -0.2], coat, 1))
  }
  if (look.scarf) {
    const scarf = mat(look.scarf)
    box(torso, [0.8, 0.13, 0.44], [0, 0.7, 0], scarf)
    flaps.push(flap(torso, [0.15, 0.6, 0.04], [0.14, 0.68, -0.22], scarf, 1.35))
    flaps.push(flap(torso, [0.13, 0.46, 0.04], [0.02, 0.68, -0.23], scarf, 1.2))
  }

  // Arms, pivoting at the shoulders.
  const arms = [-1, 1].map((side) => {
    const pivot = new Group()
    pivot.position.set(side * 0.54, 1.38, 0)
    box(pivot, [0.35, 0.58, 0.36], [0, -0.25, 0], armMat)
    box(pivot, [0.31, 0.14, 0.32], [0, -0.61, 0], handMat)
    outline(pivot, [0.35, 0.72, 0.36], [0, -0.32, 0])
    if (look.wristbands) box(pivot, [0.37, 0.1, 0.38], [0, -0.5, 0], mat(look.wristbands))
    root.add(pivot)
    return pivot
  })

  // Head.
  const head = new Group()
  head.position.set(0, 1.44 + HEAD_HEIGHT / 2 + 0.02, 0)
  root.add(head)
  const faceMat = mat('#fff', faceTexture(look))
  head.add(new Mesh(headGeometry, [faceMat, skin, skin]))
  const headOutline = new Mesh(headGeometry, OUTLINE)
  headOutline.scale.set(1 + OUTLINE_PAD / (2 * HEAD_RADIUS), 1 + OUTLINE_PAD / HEAD_HEIGHT, 1 + OUTLINE_PAD / (2 * HEAD_RADIUS))
  headOutline.userData.outline = true
  head.add(headOutline)

  if (look.collar) {
    // Tall uniform collar round the neck.
    band(head, 0.23, 0.14, -HEAD_HEIGHT / 2 + 0.02, mat(look.collar))
  }
  if (look.hood) {
    // Bulky hood bunched round the neck (Yuji's red hoodie).
    const hood = mat(look.hood)
    band(head, 0.3, 0.12, -HEAD_HEIGHT / 2 + 0.01, hood)
    box(head, [0.5, 0.2, 0.14], [0, -HEAD_HEIGHT / 2 + 0.05, -0.24], hood)
  }
  if (look.hair) addHair(head, look.hair)
  // Wide enough to wrap over the hair at the back, so it shows from behind too.
  if (look.blindfold) band(head, HEAD_RADIUS + 0.03, 0.13, 0.04, mat(look.blindfold))
  if (look.headband) {
    band(head, HEAD_RADIUS + 0.012, 0.08, 0.13, mat(look.headband))
    box(head, [0.2, 0.08, 0.02], [0, 0.13, HEAD_RADIUS + 0.02], mat('#b9c2cf'))
  }
  if (look.hat) {
    // Straw hat: wide brim + crown + red band.
    const straw = mat(look.hat.color)
    band(head, 0.46, 0.035, HEAD_HEIGHT / 2 + 0.02, straw)
    band(head, 0.27, 0.16, HEAD_HEIGHT / 2 + 0.11, straw)
    band(head, 0.275, 0.05, HEAD_HEIGHT / 2 + 0.06, mat(look.hat.band))
  }
  if (look.mask) band(head, HEAD_RADIUS + 0.012, 0.15, -0.12, mat(look.mask))
  if (look.goggles) {
    band(head, HEAD_RADIUS + 0.015, 0.06, 0.16, mat('#1a1a22'))
    const lens = mat(look.goggles, undefined, look.goggles)
    for (const side of [-1, 1]) box(head, [0.14, 0.1, 0.05], [side * 0.09, 0.16, HEAD_RADIUS + 0.02], lens)
  }
  if (look.earrings) {
    // Hanafuda earrings: white cards with a red rising sun.
    for (const side of [-1, 1]) {
      box(head, [0.02, 0.14, 0.1], [side * (HEAD_RADIUS + 0.01), -0.16, 0.02], mat('#f6f2e8'))
      box(head, [0.025, 0.05, 0.05], [side * (HEAD_RADIUS + 0.012), -0.14, 0.02], mat(look.earrings))
    }
  }
  if (look.horns) {
    const hornMat = mat(look.horns)
    cone(head, 0.06, 0.24, [0.15, 0.3, 0.05], [0, 0, -0.3], hornMat)
    cone(head, 0.06, 0.24, [-0.15, 0.3, 0.05], [0, 0, 0.3], hornMat)
  }

  root.traverse((node) => {
    if (node.isMesh && !node.userData.outline) node.castShadow = true
  })
  mergeStaticParts(root)

  return { root, legs, arms, torso, head, flaps, style: look.run || 'sprint' }
}

/**
 * Only the part groups move (leg / arm pivots, torso, head, cloth flaps); the
 * boxes inside each group never move relative to it. So within every group,
 * the plain meshes that share a material become one mesh. A character drops
 * from ~55 meshes (draw calls) to ~15, which is most of the lobby's cost: it
 * shows a whole stand of them.
 */
function mergeStaticParts(root) {
  const parents = []
  root.traverse((node) => {
    if (!node.isMesh) parents.push(node)
  })
  for (const parent of parents) {
    const byMaterial = new Map()
    for (const child of parent.children) {
      // Multi-material meshes (face / torso print) and mirrored ones stay as they are.
      if (!child.isMesh || child.children.length || Array.isArray(child.material)) continue
      child.updateMatrix()
      if (child.matrix.determinant() <= 0) continue
      const list = byMaterial.get(child.material) || []
      list.push(child)
      byMaterial.set(child.material, list)
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue
      const merged = mergeGeometries(
        meshes.map((m) => {
          const g = m.geometry.clone()
          g.clearGroups()
          return g.applyMatrix4(m.matrix)
        }),
      )
      if (!merged) continue
      const mesh = new Mesh(merged, material)
      mesh.userData.outline = meshes[0].userData.outline
      mesh.userData.merged = true
      mesh.castShadow = meshes[0].castShadow
      for (const m of meshes) parent.remove(m)
      parent.add(mesh)
    }
  }
}

/** Frees the GPU buffers of a model's merged meshes (the shared ones are kept). */
export function disposeModel(model) {
  model.root.traverse((node) => {
    if (node.userData.merged) node.geometry.dispose()
  })
}

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => Math.min(1, Math.max(0, v))

/**
 * Running styles, picked per anime with `look.run`:
 *   sprint - big pumping arms (the default)
 *   ninja  - arms swept straight back once they get going
 *   cool   - relaxed, small arm swing, barely leaning
 *   brawler - wide, heavy arms
 */
const RUN_STYLES = {
  sprint: { arm: 1, spread: 0.08, lean: 1, back: 0.55 },
  ninja: { arm: 0.8, spread: 0.12, lean: 1.25, back: 1 },
  cool: { arm: 0.55, spread: 0.04, lean: 0.7, back: 0.3 },
  brawler: { arm: 1.15, spread: 0.3, lean: 1.1, back: 0.35 },
}

/**
 * Drives the joints for idle / run / jump, Roblox R6 style.
 *
 * The stride follows the real ground speed: a slow anime jogs, a fast one's legs
 * blur, leans hard into the run and (ninja style) sweeps its arms back. Poses
 * blend smoothly and the stride phase is accumulated, so changing speed never
 * makes the legs jump mid-stride.
 *
 * @param {object} model from buildAnimeModel
 * @param {{ time?: number, speed?: number, grounded?: boolean, dead?: boolean }} motion
 *   `speed` is the horizontal speed in metres per second.
 * @param {number} dt seconds since the last frame
 */
export function animateModel(model, motion, dt = 1 / 60) {
  const { time = 0, speed = 0, grounded = true, dead = false } = motion
  if (dead) return
  const st = (model.anim ||= { phase: 0, run: 0, air: 0, fast: 0 })
  const step = Math.min(dt, 0.1)
  const style = RUN_STYLES[model.style] || RUN_STYLES.sprint

  const k = 1 - Math.exp(-12 * step)
  st.run = lerp(st.run, grounded ? clamp01(speed / 4) : 0, k)
  // 0 at a jog (~7 m/s), 1 flat out (~30 m/s).
  // 0 at an easy jog (~6 m/s), 1 flat out (~19 m/s, the top level's walk speed).
  st.fast = lerp(st.fast, clamp01((speed - 6) / 13), 1 - Math.exp(-5 * step))
  st.air = lerp(st.air, grounded ? 0 : 1, 1 - Math.exp(-16 * step))

  // Strides per second grow with speed: ~1.5 at base walk speed, ~5 flat out.
  const cadence = Math.min(5.4, 0.9 + 0.2 * speed)
  st.phase += step * Math.PI * 2 * (st.run > 0.02 ? cadence : 1.3)
  const s = Math.sin(st.phase)
  const run = st.run
  const fast = st.fast
  const air = st.air
  const idle = Math.sin(time * 1.8)
  const still = 1 - Math.min(1, run * 4)

  const [legL, legR] = model.legs
  const [armL, armR] = model.arms

  // Ground pose: run swing (bigger the faster), fading into a breathing idle.
  const legSwing = run * (0.95 + 0.45 * fast)
  const armSwing = run * style.arm * (0.9 + 0.55 * fast)
  // Ninja run: arms stream out behind at speed.
  const back = style.back * Math.min(1, fast * 1.5) ** 2 * run
  const spread = style.spread * run + 0.12 * back
  const g = {
    legL: s * legSwing,
    legR: -s * legSwing,
    armL: lerp(-s * armSwing, 1.35 + s * 0.08, back) + idle * 0.04 * still,
    armR: lerp(s * armSwing, 1.35 - s * 0.08, back) - idle * 0.04 * still,
    armLz: -spread - (0.05 + idle * 0.02) * still,
    armRz: spread + (0.05 + idle * 0.02) * still,
  }
  // Air pose: arms thrown up, one knee forward.
  const j = { legL: -0.6, legR: 0.35, armL: -2.75, armR: -2.75, armLz: -0.22, armRz: 0.22 }

  legL.rotation.x = lerp(g.legL, j.legL, air)
  legR.rotation.x = lerp(g.legR, j.legR, air)
  armL.rotation.x = lerp(g.armL, j.armL, air)
  armR.rotation.x = lerp(g.armR, j.armR, air)
  armL.rotation.z = lerp(g.armLz, j.armLz, air)
  armR.rotation.z = lerp(g.armRz, j.armRz, air)

  // Lean into the run (harder the faster), bounce once per step, keep the head up.
  const ground = 1 - air
  model.root.rotation.x = run * style.lean * (0.12 + 0.34 * fast) * ground
  model.root.position.y = Math.abs(s) * 0.075 * run * (1 - 0.35 * fast) * ground
  model.head.rotation.x = -run * style.lean * (0.08 + 0.2 * fast) * ground + idle * 0.02 * still
  model.head.rotation.y = Math.sin(time * 0.7) * 0.12 * still

  // Capes, coat tails and scarves stream back with speed and flutter in the wind.
  const wind = 0.35 * run + 1.05 * run * fast + 0.5 * air
  for (const f of model.flaps) {
    const flutter = Math.sin(time * (6 + 10 * fast) + f.seed) * (0.05 + 0.12 * (run + air) * f.amp)
    f.pivot.rotation.x = 0.06 + wind * f.amp + flutter + idle * 0.02 * still
  }
}
