import { useEffect, useMemo } from 'react'
import { Color, Group, InstancedMesh, MeshBasicMaterial, Object3D } from 'three'

import { FLUID_Y } from '../config'
import { rng } from '../layout'
import { getMaterial, unitBox, unitCone, unitCone4, unitCylinder, unitOcta, unitSphere } from '../materials'

/**
 * Background scenery lining a stretch of path: blocky cliffs with grass tops,
 * trees, temples, crystals, volcanoes, planets... picked by the theme's `props`.
 *
 * Every prop is a handful of primitive instances; they are grouped by shape and
 * by "glowing or not" into a few InstancedMeshes, so a whole stage's scenery is
 * about ten draw calls. Nothing here has a collider - it all stands well off the
 * path.
 */

const GEOS = { box: unitBox, cone: unitCone, cone4: unitCone4, cyl: unitCylinder, sphere: unitSphere, octa: unitOcta }

const studsMaterial = () => getMaterial({ color: '#ffffff', pattern: 'studs', tile: 2 })
const plainMaterial = () => getMaterial({ color: '#ffffff' })
const glowMaterial = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false })

/** A builder: records primitive instances. */
class Kit {
  constructor() {
    this.items = []
  }
  add(g, p, s, c, { r, glow = false, studs = false } = {}) {
    this.items.push({ g, p, s, c, r, glow, studs })
  }
  box(p, s, c, o) {
    this.add('box', p, s, c, o)
  }
}

// ---------------------------------------------------------------------------
// Props. Each draws one thing at ground position (x, y, z) with scale `k`.
// ---------------------------------------------------------------------------

const PROPS = {
  trees(kit, x, y, z, k, rand, theme, leaf = ['#4fc84a', '#3aa83a', '#6fdc4f']) {
    const h = (4 + rand() * 4) * k
    kit.box([x, y + h / 2, z], [0.9 * k, h, 0.9 * k], '#8a5a3a')
    const c = leaf[Math.floor(rand() * leaf.length)]
    kit.box([x, y + h + 0.6 * k, z], [4.4 * k, 2.4 * k, 4.4 * k], c, { studs: true })
    kit.box([x, y + h + 2.4 * k, z], [3 * k, 1.8 * k, 3 * k], c, { studs: true })
  },
  sakura(kit, x, y, z, k, rand, theme) {
    PROPS.trees(kit, x, y, z, k, rand, theme, ['#ff9ac8', '#ffb7d5', '#ff7ab0'])
  },
  bamboo(kit, x, y, z, k, rand) {
    for (let i = 0; i < 5; i += 1) {
      const h = (10 + rand() * 12) * k
      const bx = x + (rand() - 0.5) * 4
      const bz = z + (rand() - 0.5) * 4
      kit.box([bx, y + h / 2, bz], [0.5, h, 0.5], i % 2 ? '#5ac84a' : '#7ae05a')
      for (let j = 3; j < h; j += 3) kit.box([bx, y + j, bz], [0.62, 0.2, 0.62], '#3a8a2a')
      kit.box([bx + 0.6, y + h - 1, bz], [1.6, 0.15, 0.5], '#7ae05a')
    }
  },
  torii(kit, x, y, z, k) {
    const h = 9 * k
    const w = 8 * k
    for (const s of [-1, 1]) kit.add('cyl', [x + (s * w) / 2, y + h / 2, z], [0.9 * k, h, 0.9 * k], '#e0303a')
    kit.box([x, y + h, z], [w + 3 * k, 0.9 * k, 1.2 * k], '#1a1a1a')
    kit.box([x, y + h - 0.6 * k, z], [w + 2.2 * k, 0.6 * k, 0.9 * k], '#e0303a')
    kit.box([x, y + h - 2.2 * k, z], [w, 0.5 * k, 0.6 * k], '#e0303a')
  },
  lanterns(kit, x, y, z) {
    kit.box([x, y + 0.6, z], [1.4, 1.2, 1.4], '#a8a8b0', { studs: true })
    kit.box([x, y + 2, z], [0.6, 1.8, 0.6], '#a8a8b0')
    kit.box([x, y + 3.4, z], [1.3, 1.1, 1.3], '#ffd86a', { glow: true })
    kit.add('cone4', [x, y + 4.4, z], [2.2, 1, 2.2], '#6a6a72', { r: [0, Math.PI / 4, 0] })
  },
  pyramids(kit, x, y, z, k, rand) {
    const s = (18 + rand() * 22) * k
    kit.add('cone4', [x, y + s / 2 - 1, z], [s * 1.4, s, s * 1.4], '#f2c79a', { r: [0, Math.PI / 4, 0], studs: true })
  },
  palms(kit, x, y, z, k, rand) {
    const h = (6 + rand() * 4) * k
    const lean = (rand() - 0.5) * 0.4
    kit.add('cyl', [x, y + h / 2, z], [0.7 * k, h, 0.7 * k], '#b8864a', { r: [0, 0, lean] })
    const tx = x - Math.sin(lean) * h * 0.5
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2
      kit.box([tx + Math.cos(a) * 1.8 * k, y + h - 0.3, z + Math.sin(a) * 1.8 * k], [3.6 * k, 0.2, 1.1 * k], '#3ab84a', { r: [0, -a, 0.35] })
    }
  },
  swords(kit, x, y, z, k, rand) {
    const h = (18 + rand() * 12) * k
    const tilt = (rand() - 0.5) * 0.5
    kit.box([x, y + h / 2 - 3, z], [0.5 * k, h, 2.4 * k], '#d8dce8', { r: [tilt, 0, (rand() - 0.5) * 0.3] })
    kit.box([x, y + h - 2.5, z], [0.8 * k, 0.8 * k, 4 * k], '#c8a03a', { r: [tilt, 0, 0] })
    kit.box([x, y + h + 1.2, z], [0.7 * k, 6 * k, 0.9 * k], '#ff6a9a', { r: [tilt, 0, 0] })
  },
  ships(kit, x, y, z, k, rand) {
    const yy = FLUID_Y + 1
    kit.box([x, yy, z], [7 * k, 3 * k, 18 * k], '#8a5a2a')
    kit.box([x, yy + 2, z - 6 * k], [7 * k, 2 * k, 5 * k], '#a8743a')
    kit.box([x, yy + 8 * k, z], [0.6, 14 * k, 0.6], '#6a4a2a')
    kit.box([x, yy + 9 * k, z], [0.2, 7 * k, 8 * k], '#fff6e8')
    kit.box([x, yy + 15 * k, z], [0.2, 1.2, 2.2], rand() < 0.5 ? '#e0303a' : '#1a1a1a')
  },
  volcanoes(kit, x, y, z, k, rand) {
    const s = (24 + rand() * 30) * k
    kit.add('cone', [x, y + s / 2 - 2, z], [s * 1.6, s, s * 1.6], '#3a2a2a', { studs: true })
    kit.add('cone', [x, y + s * 0.82, z], [s * 0.5, s * 0.25, s * 0.5], '#ff6a1f', { glow: true })
  },
  rocks(kit, x, y, z, k, rand) {
    const s = (2 + rand() * 4) * k
    kit.add('octa', [x, y + s * 0.3, z], [s * 1.4, s, s * 1.2], '#7a7a86', { r: [rand(), rand() * 3, 0] })
  },
  pines(kit, x, y, z, k, rand) {
    const h = (6 + rand() * 6) * k
    kit.box([x, y + 1, z], [0.8, 2, 0.8], '#6a4a2a')
    for (let i = 0; i < 3; i += 1) {
      const s = (4.6 - i * 1.2) * k
      kit.add('cone', [x, y + 2 + i * h * 0.25 + s * 0.4, z], [s, s * 0.9, s], '#2f8a5a')
      kit.add('cone', [x, y + 2.3 + i * h * 0.25 + s * 0.55, z], [s * 0.7, s * 0.5, s * 0.7], '#ffffff')
    }
  },
  icespikes(kit, x, y, z, k, rand) {
    for (let i = 0; i < 3; i += 1) {
      const h = (6 + rand() * 10) * k
      kit.add('cone4', [x + (rand() - 0.5) * 5, y + h / 2, z + (rand() - 0.5) * 5], [2 * k, h, 2 * k], '#9fe8ff', { glow: rand() < 0.4, r: [0, rand(), (rand() - 0.5) * 0.3] })
    }
  },
  pagodas(kit, x, y, z, k) {
    let yy = y
    for (let i = 0; i < 4; i += 1) {
      const s = (12 - i * 2.2) * k
      kit.box([x, yy + 2, z], [s * 0.7, 4, s * 0.7], '#2a2234', { studs: true })
      kit.box([x, yy + 4.3, z], [s, 0.7, s], '#c83a3a')
      kit.box([x + s * 0.36, yy + 2.4, z + s * 0.36], [0.6, 0.6, 0.6], '#ffd86a', { glow: true })
      yy += 4.6
    }
    kit.add('cone4', [x, yy + 1.5, z], [3, 3, 3], '#c83a3a', { r: [0, Math.PI / 4, 0] })
  },
  moon(kit, x, y, z) {
    kit.add('sphere', [x * 3, 140, z - 200], [60, 60, 60], '#fff6d8', { glow: true })
  },
  crystals(kit, x, y, z, k, rand, theme) {
    const colors = [theme.wallTop, theme.accent, '#7af0ff']
    for (let i = 0; i < 3; i += 1) {
      const h = (4 + rand() * 9) * k
      kit.add('octa', [x + (rand() - 0.5) * 6, y + h * 0.35, z + (rand() - 0.5) * 6], [h * 0.45, h, h * 0.45], colors[i % colors.length], {
        glow: true,
        r: [(rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5],
      })
    }
  },
  rods(kit, x, y, z, k, rand) {
    const h = (14 + rand() * 10) * k
    kit.box([x, y + h / 2, z], [0.6, h, 0.6], '#8a8a96')
    kit.add('sphere', [x, y + h + 0.6, z], [1.6, 1.6, 1.6], '#ffe23a', { glow: true })
  },
  deadtrees(kit, x, y, z, k, rand) {
    const h = (6 + rand() * 6) * k
    kit.box([x, y + h / 2, z], [0.9, h, 0.9], '#3a2a2a')
    for (let i = 0; i < 3; i += 1) {
      const by = y + h * (0.5 + i * 0.15)
      const s = rand() < 0.5 ? -1 : 1
      kit.box([x + s * 1.4, by, z], [2.8 * k, 0.4, 0.4], '#3a2a2a', { r: [0, rand() * 3, s * 0.5] })
    }
  },
  mushrooms(kit, x, y, z, k, rand) {
    const h = (2 + rand() * 4) * k
    const cap = ['#ff4a5a', '#b84aff', '#4affc8'][Math.floor(rand() * 3)]
    kit.add('cyl', [x, y + h / 2, z], [0.9 * k, h, 0.9 * k], '#f2e8d8')
    kit.add('sphere', [x, y + h, z], [4 * k, 2 * k, 4 * k], cap, { glow: rand() < 0.5 })
  },
  columns(kit, x, y, z, k, rand) {
    const h = (10 + rand() * 12) * k
    kit.add('cyl', [x, y + h / 2, z], [2.2 * k, h, 2.2 * k], '#ffffff', { studs: true })
    kit.box([x, y + h + 0.4, z], [3.2 * k, 0.8, 3.2 * k], '#ffd23f')
    kit.box([x, y + 0.4, z], [3.2 * k, 0.8, 3.2 * k], '#ffd23f')
  },
  cloudisles(kit, x, y, z, k, rand) {
    const yy = y + 4 + rand() * 20
    for (let i = 0; i < 4; i += 1) kit.box([x + (rand() - 0.5) * 12, yy + rand() * 3, z + (rand() - 0.5) * 12], [6 + rand() * 8, 3 + rand() * 3, 6 + rand() * 8], '#ffffff')
  },
  spires(kit, x, y, z, k, rand, theme) {
    const h = (16 + rand() * 24) * k
    kit.add('cone4', [x, y + h / 2, z], [5 * k, h, 5 * k], '#140a24', { studs: true })
    kit.add('octa', [x, y + h + 2, z], [2.4, 3.4, 2.4], theme.wallTop, { glow: true })
  },
  towers(kit, x, y, z, k, rand, theme) {
    const h = (20 + rand() * 50) * k
    const w = (8 + rand() * 8) * k
    kit.box([x, y + h / 2, z], [w, h, w], '#141428')
    const neon = rand() < 0.5 ? theme.wallTop : theme.trim
    for (let j = 6; j < h; j += 6) kit.box([x, y + j, z], [w + 0.2, 0.3, w + 0.2], neon, { glow: true })
    kit.box([x, y + h + 1.5, z], [0.4, 3, 0.4], neon, { glow: true })
  },
  spikes(kit, x, y, z, k, rand) {
    for (let i = 0; i < 3; i += 1) {
      const h = (6 + rand() * 12) * k
      kit.add('cone', [x + (rand() - 0.5) * 6, y + h / 2, z + (rand() - 0.5) * 6], [2.4 * k, h, 2.4 * k], '#2a1a1a', { r: [(rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4] })
    }
  },
  corals(kit, x, y, z, k, rand) {
    const colors = ['#ff5a8a', '#ffb03a', '#a46bff', '#3ae8ff', '#ff7af0']
    for (let i = 0; i < 4; i += 1) {
      const h = (2 + rand() * 6) * k
      const c = colors[Math.floor(rand() * colors.length)]
      const px = x + (rand() - 0.5) * 6
      const pz = z + (rand() - 0.5) * 6
      kit.add('cyl', [px, y + h / 2, pz], [1 * k, h, 1 * k], c, { r: [(rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6] })
      kit.add('sphere', [px, y + h, pz], [2 * k, 2 * k, 2 * k], c, { glow: rand() < 0.3 })
    }
  },
  lollipops(kit, x, y, z, k, rand) {
    const h = (6 + rand() * 6) * k
    const c = ['#ff4fa8', '#4fd8ff', '#ffd23f', '#8aff6a'][Math.floor(rand() * 4)]
    kit.add('cyl', [x, y + h / 2, z], [0.5, h, 0.5], '#ffffff')
    kit.add('cyl', [x, y + h + 1.5 * k, z], [5 * k, 0.8 * k, 5 * k], c, { r: [Math.PI / 2, 0, 0] })
    kit.add('cyl', [x, y + h + 1.5 * k, z], [2.6 * k, 0.9 * k, 2.6 * k], '#ffffff', { r: [Math.PI / 2, 0, 0] })
  },
  gumdrops(kit, x, y, z, k, rand) {
    const c = ['#ff4fa8', '#4fd8ff', '#ffd23f', '#8aff6a', '#c47bff'][Math.floor(rand() * 5)]
    const s = (2 + rand() * 4) * k
    kit.add('sphere', [x, y + s * 0.35, z], [s, s * 0.8, s], c)
  },
  planets(kit, x, y, z, k, rand) {
    const s = (8 + rand() * 30) * k
    const c = ['#ff6af0', '#6a8aff', '#ffb03a', '#3ae8c8'][Math.floor(rand() * 4)]
    const py = y + 20 + rand() * 60
    kit.add('sphere', [x * 1.5, py, z], [s, s, s], c, { glow: rand() < 0.3 })
    if (rand() < 0.6) kit.add('cyl', [x * 1.5, py, z], [s * 2, 0.4, s * 2], '#ffffff', { glow: true, r: [0.3, 0, 0.2] })
  },
  mountains(kit, x, y, z, k, rand, theme) {
    const h = (40 + rand() * 50) * k
    const w = h * (1.1 + rand() * 0.5)
    kit.add('cone', [x * 1.4, y + h / 2 - 2, z], [w, h, w * 0.9], theme.wall, { studs: true, r: [0, rand() * 3, 0] })
    kit.add('cone', [x * 1.4, y + h * 0.82, z], [w * 0.36, h * 0.36, w * 0.33], theme.wallTop === '#ffffff' || theme.night ? '#ffffff' : theme.wallTop, { r: [0, rand() * 3, 0] })
  },
  dunes(kit, x, y, z, k, rand) {
    const w = (20 + rand() * 30) * k
    kit.add('sphere', [x, y, z], [w, w * 0.28, w * (0.6 + rand() * 0.6)], rand() < 0.5 ? '#f2c79a' : '#e8b07a', { studs: true })
  },
  islands(kit, x, y, z, k, rand, theme) {
    PROPS.trees(kit, x, y, z, 1.1 * k, rand, theme)
    if (rand() < 0.5) PROPS.trees(kit, x + 3, y, z - 3, 0.8 * k, rand, theme)
  },
  castles(kit, x, y, z, k, rand, theme) {
    const h = (16 + rand() * 20) * k
    const w = 7 * k
    kit.box([x, y + h / 2, z], [w, h, w], '#2a1a24', { studs: true })
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.box([x + (dx * w) / 2.6, y + h + 1, z + (dz * w) / 2.6], [1.6, 2, 1.6], '#2a1a24')
    kit.box([x + w / 2 + 0.1, y + h * 0.7, z], [0.2, h * 0.35, 2.2], theme.wallTop)
    kit.box([x, y + h * 0.5, z + w / 2 + 0.1], [1.2, 1.6, 0.2], '#ffb03a', { glow: true })
  },
}

/** Blocky cliffs with grass (or lava / neon) tops, in two rows each side. */
function cliffs(kit, rand, theme, z0, z1, inner) {
  for (const side of [-1, 1]) {
    for (const row of [0, 1]) {
      let z = z0 - rand() * 8
      while (z > z1) {
        const w = (row ? 16 : 10) + rand() * (row ? 22 : 14)
        const d = 10 + rand() * 14
        const top = (row ? 18 : 6) + rand() * (row ? 34 : 18)
        const base = FLUID_Y - 2
        const x = side * (inner + 10 + row * 34 + rand() * 18 + w / 2)
        kit.box([x, (top + base) / 2, z], [w, top - base, d], theme.wall, { studs: true })
        kit.box([x, top + 0.6, z], [w + 0.8, 1.2, d + 0.8], theme.wallTop, { glow: !!theme.glowTop, studs: !theme.glowTop })
        if (!theme.glowTop && rand() < 0.35) PROPS.trees(kit, x + (rand() - 0.5) * (w - 4), top + 1.2, z + (rand() - 0.5) * (d - 4), 0.9, rand, theme)
        z -= d * (0.7 + rand() * 0.5)
      }
    }
  }
}

/** Builds the instance lists for a stretch [z0 > z1] of path `width` wide. */
function buildKit(theme, z0, z1, width, seed) {
  const kit = new Kit()
  const rand = rng(seed)
  const inner = width / 2
  const props = theme.props || []
  if (props.includes('cliffs')) cliffs(kit, rand, theme, z0, z1, inner)
  const others = props.filter((p) => p !== 'cliffs' && PROPS[p])
  if (others.length) {
    if (others.includes('moon')) PROPS.moon(kit, 1, 0, z0)
    const list = others.filter((p) => p !== 'moon')
    let z = z0 - 6
    let i = 0
    while (z > z1 && list.length) {
      for (const side of [-1, 1]) {
        const name = list[(i + (side > 0 ? 1 : 0)) % list.length]
        const big = ['pyramids', 'volcanoes', 'towers', 'castles', 'planets', 'pagodas', 'mountains', 'dunes'].includes(name)
        const x = side * (inner + (big ? 30 + rand() * 60 : 7 + rand() * 18))
        const y = big ? FLUID_Y : FLUID_Y + 1
        // Small props stand on a little island of their own.
        if (!big && name !== 'cloudisles' && name !== 'ships') {
          kit.box([x, (FLUID_Y + 1 + FLUID_Y - 2) / 2, z], [9, 3, 9], theme.wall, { studs: true })
          kit.box([x, FLUID_Y + 1.2, z], [9.6, 0.6, 9.6], theme.wallTop, { glow: !!theme.glowTop, studs: !theme.glowTop })
          PROPS[name](kit, x, FLUID_Y + 1.5, z, 1, rand, theme)
        } else {
          PROPS[name](kit, x, y, z, 1, rand, theme)
        }
      }
      i += 1
      z -= 16 + rand() * 18
    }
  }
  return kit
}

const _o = new Object3D()
const _c = new Color()

function toMeshes(kit) {
  const groups = new Map()
  for (const it of kit.items) {
    const key = `${it.g}|${it.glow ? 'g' : it.studs ? 's' : 'p'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  }
  const root = new Group()
  for (const [key, items] of groups) {
    const [g, kind] = key.split('|')
    const material = kind === 'g' ? glowMaterial : kind === 's' ? studsMaterial() : plainMaterial()
    const mesh = new InstancedMesh(GEOS[g], material, items.length)
    items.forEach((it, i) => {
      _o.position.set(it.p[0], it.p[1], it.p[2])
      _o.rotation.set(it.r?.[0] || 0, it.r?.[1] || 0, it.r?.[2] || 0)
      _o.scale.set(it.s[0], it.s[1], it.s[2])
      _o.updateMatrix()
      mesh.setMatrixAt(i, _o.matrix)
      mesh.setColorAt(i, _c.set(it.c))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Far scenery never lands in the shadow map: it would be redrawn into it every frame.
    mesh.castShadow = false
    mesh.computeBoundingSphere()
    root.add(mesh)
  }
  return root
}

/** Scenery for one stretch of the map. */
export function Scenery({ theme, z0, z1, width, seed = 1 }) {
  const root = useMemo(() => toMeshes(buildKit(theme, z0, z1, width, seed)), [theme, z0, z1, width, seed])
  useEffect(
    () => () => {
      for (const child of root.children) child.dispose?.()
    },
    [root],
  )
  return <primitive object={root} />
}

export default Scenery
