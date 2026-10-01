import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

/**
 * Procedural textures, all drawn on canvases at runtime - the map ships no image
 * assets. Surface patterns are drawn near-white so a material's colour tints them,
 * the way Roblox materials take a part's BrickColor.
 */

export const FONT = 'Fredoka'

/** Resolves once the HUD/sign font is usable in canvases (or after a timeout). */
export const fontsReady =
  typeof document !== 'undefined' && document.fonts
    ? Promise.race([
        Promise.all([
          document.fonts.load(`700 64px "${FONT}"`),
          document.fonts.load(`600 64px "${FONT}"`),
        ]),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]).then(
        () => true,
        () => true,
      )
    : Promise.resolve(true)

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Canvas textures waiting to be sent to the GPU (see TextureUploader in GameScene). */
export const pendingUploads = []

function toTexture(canvas, { repeat = true } = {}) {
  const texture = new CanvasTexture(canvas)
  pendingUploads.push(texture)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  if (repeat) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
  } else {
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.minFilter = LinearFilter
  }
  return texture
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Deterministic PRNG so patterns look the same every load. */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Tiling surface patterns
// ---------------------------------------------------------------------------

/** One Roblox stud: a small rounded inlet with a lit top edge and shadowed bottom. */
function stud(ctx, x, y, w, h) {
  const r = Math.min(w, h) * 0.3
  ctx.fillStyle = 'rgba(0,0,0,0.10)'
  roundRect(ctx, x + 1.5, y + 2.5, w, h, r)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/**
 * All surface patterns are 128px and drawn a notch below white, so a stud (pure
 * white) reads as a highlight once the material colour tints the texture.
 */
const PATTERNS = {
  /** Roblox studs: a 4x4 grid of small rounded inlets per texture. */
  studs(ctx, w, h) {
    ctx.fillStyle = '#e4e4e8'
    ctx.fillRect(0, 0, w, h)
    const n = 4
    const cw = w / n
    const ch = h / n
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) stud(ctx, i * cw + cw * 0.22, j * ch + ch * 0.3, cw * 0.56, ch * 0.36)
  },
  /** The "L" marks Roblox's plastic walls show in the screenshots. */
  lmarks(ctx, w, h) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    const n = 4
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        const x = (i + (j % 2) * 0.5) * (w / n) + 6
        const y = j * (h / n) + 6
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + 14)
        ctx.lineTo(x + 9, y + 14)
        ctx.stroke()
      }
  },
  bricks(ctx, w, h) {
    const rand = rng(7)
    ctx.fillStyle = '#c9c9d0'
    ctx.fillRect(0, 0, w, h)
    const rows = 8
    const bh = h / rows
    const bw = w / 4
    for (let r = 0; r < rows; r += 1) {
      const offset = r % 2 ? bw / 2 : 0
      for (let c = -1; c < 5; c += 1) {
        const shade = 222 + Math.floor(rand() * 26)
        ctx.fillStyle = `rgb(${shade},${shade},${shade + 4})`
        roundRect(ctx, c * bw + offset + 2, r * bh + 2, bw - 4, bh - 4, 2)
        ctx.fill()
        // Lit top edge, like the original's plastic bricks.
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(c * bw + offset + 3, r * bh + 2.5, bw - 6, 2)
      }
    }
  },
  /** Grey checker floor, 2x2 studs on every square (stages 4-6). */
  checker(ctx, w, h) {
    ctx.fillStyle = '#f2f2f6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#cfcfda'
    ctx.fillRect(0, 0, w / 2, h / 2)
    ctx.fillRect(w / 2, h / 2, w / 2, h / 2)
    const n = 4
    const cw = w / n
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        ctx.globalAlpha = 0.55
        stud(ctx, i * cw + cw * 0.22, j * cw + cw * 0.3, cw * 0.56, cw * 0.36)
        ctx.globalAlpha = 1
      }
  },
  /**
   * The blue stage floor: Roblox diamond plate. Each square is split into two
   * shaded triangles with short raised dashes.
   */
  diamond(ctx, w) {
    const n = 2
    const s = w / n
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        const x = i * s
        const y = j * s
        ctx.fillStyle = (i + j) % 2 ? '#e8e8f0' : '#dcdce8'
        ctx.fillRect(x, y, s, s)
        ctx.fillStyle = (i + j) % 2 ? '#f4f4fa' : '#e8e8f2'
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + s, y)
        ctx.lineTo(x, y + s)
        ctx.closePath()
        ctx.fill()
      }
    ctx.strokeStyle = 'rgba(40,40,80,0.28)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    const d = w / 4
    for (let i = 0; i < 4; i += 1)
      for (let j = 0; j < 4; j += 1) {
        const x = i * d + d / 2
        const y = j * d + d / 2
        const flip = (i + j) % 2
        ctx.beginPath()
        ctx.moveTo(x - 7, y + (flip ? -7 : 7))
        ctx.lineTo(x + 7, y + (flip ? 7 : -7))
        ctx.stroke()
      }
  },
  /** Plank crate with an X brace. */
  crate(ctx, w, h) {
    ctx.fillStyle = '#b8743f'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#7a4520'
    ctx.lineWidth = 18
    ctx.strokeRect(9, 9, w - 18, h - 18)
    ctx.beginPath()
    ctx.moveTo(14, 14)
    ctx.lineTo(w - 14, h - 14)
    ctx.moveTo(w - 14, 14)
    ctx.lineTo(14, h - 14)
    ctx.stroke()
  },
  /** Polished dojo floorboards: long planks with grain and staggered joints. */
  planks(ctx, w, h) {
    const rand = rng(21)
    const rows = 4
    const ph = h / rows
    for (let r = 0; r < rows; r += 1) {
      const shade = 214 + Math.floor(rand() * 30)
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`
      ctx.fillRect(0, r * ph, w, ph)
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'
      ctx.lineWidth = 1.5
      for (let g = 0; g < 3; g += 1) {
        const y = r * ph + 5 + rand() * (ph - 10)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(w * 0.3, y + 3, w * 0.6, y - 3, w, y)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fillRect(0, r * ph, w, 2.5)
      const joint = ((r % 2) * 0.5 + 0.25) * w
      ctx.fillRect(joint, r * ph, 2.5, ph)
    }
  },
  /** Curved Japanese roof tiles (kawara) in overlapping rows. */
  roof(ctx, w, h) {
    ctx.fillStyle = '#b8bccb'
    ctx.fillRect(0, 0, w, h)
    const rows = 4
    const cols = 4
    const ch = h / rows
    const cw = w / cols
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const x = c * cw
        const y = r * ch
        const g = ctx.createLinearGradient(x, 0, x + cw, 0)
        g.addColorStop(0, '#d0d4e0')
        g.addColorStop(0.5, '#f4f6fc')
        g.addColorStop(1, '#c4c8d6')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(x + 2, y + ch)
        ctx.lineTo(x + 2, y + ch * 0.3)
        ctx.quadraticCurveTo(x + cw / 2, y - ch * 0.15, x + cw - 2, y + ch * 0.3)
        ctx.lineTo(x + cw - 2, y + ch)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        ctx.fillRect(x, y + ch - 3, cw, 3)
      }
  },
  /** Treadmill belt stripes; scrolled by offsetting the texture. */
  belt(ctx, w, h) {
    ctx.fillStyle = '#26262e'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#3c3c48'
    for (let i = 0; i < 4; i += 1) ctx.fillRect((i * w) / 4, 0, 10, h)
  },
}

/** Voronoi cell pattern, used for lava and the cracked ice walls. */
function voronoi(ctx, w, h, { seed, points, base, edge, edgeWidth, glow }) {
  const rand = rng(seed)
  const pts = []
  for (let i = 0; i < points; i += 1) pts.push([rand() * w, rand() * h])
  // Tile-able: mirror points into the 8 neighbours.
  const all = []
  for (const [x, y] of pts)
    for (let ox = -1; ox <= 1; ox += 1)
      for (let oy = -1; oy <= 1; oy += 1) all.push([x + ox * w, y + oy * h])

  // Pixels are written directly, and putImageData ignores the canvas's scale:
  // work at its real resolution, sampling the w x h layout.
  const scale = ctx.getTransform().a
  const pw = Math.round(w * scale)
  const ph = Math.round(h * scale)
  const img = ctx.createImageData(pw, ph)
  const b = hexToRgb(base)
  const e = hexToRgb(edge)
  const g = glow ? hexToRgb(glow) : null
  for (let py0 = 0; py0 < ph; py0 += 1) {
    const y = py0 / scale
    for (let px0 = 0; px0 < pw; px0 += 1) {
      const x = px0 / scale
      let d1 = Infinity
      let d2 = Infinity
      for (const [px, py] of all) {
        const d = (px - x) ** 2 + (py - y) ** 2
        if (d < d1) {
          d2 = d1
          d1 = d
        } else if (d < d2) d2 = d
      }
      const gap = Math.sqrt(d2) - Math.sqrt(d1)
      let t = gap < edgeWidth ? 1 - gap / edgeWidth : 0
      let c = mix(b, e, t)
      if (g && t === 0) c = mix(b, g, Math.min(1, Math.sqrt(d1) / 40) * 0.6)
      const i = (py0 * pw + px0) * 4
      img.data[i] = c[0]
      img.data[i + 1] = c[1]
      img.data[i + 2] = c[2]
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

const COLOURED_PATTERNS = {
  lava: (ctx, w, h) =>
    voronoi(ctx, w, h, {
      seed: 3,
      points: 14,
      base: '#ffb21a',
      edge: '#ff5a00',
      edgeWidth: 9,
      glow: '#ff7a00',
    }),
  acid: (ctx, w, h) =>
    voronoi(ctx, w, h, {
      seed: 5,
      points: 14,
      base: '#b8ff3a',
      edge: '#2fbf1f',
      edgeWidth: 9,
      glow: '#5fe62a',
    }),
  ice: (ctx, w, h) =>
    voronoi(ctx, w, h, { seed: 11, points: 16, base: '#1aa7f5', edge: '#8fe6ff', edgeWidth: 4 }),
  crystal: (ctx, w, h) =>
    voronoi(ctx, w, h, { seed: 13, points: 16, base: '#e04bd8', edge: '#ffc2f6', edgeWidth: 4 }),
}

const patternCache = new Map()
const PATTERN_SCALE = 2

/** A tiling pattern texture, cloned per repeat so each surface tiles at its size. */
export function patternTexture(kind, repeatX = 1, repeatY = 1) {
  const baseKey = kind
  if (!patternCache.has(baseKey)) {
    // Drawn at 2x (the patterns are laid out for 128px) so walls and floors stay
    // crisp up close.
    const size = 128
    const canvas = makeCanvas(size * PATTERN_SCALE, size * PATTERN_SCALE)
    const ctx = canvas.getContext('2d')
    ctx.scale(PATTERN_SCALE, PATTERN_SCALE)
    ;(COLOURED_PATTERNS[kind] || PATTERNS[kind])(ctx, size, size)
    patternCache.set(baseKey, toTexture(canvas))
  }
  const rx = Math.max(0.25, Math.round(repeatX * 4) / 4)
  const ry = Math.max(0.25, Math.round(repeatY * 4) / 4)
  const key = `${kind}|${rx}|${ry}`
  if (!patternCache.has(key)) {
    const texture = patternCache.get(baseKey).clone()
    texture.repeat.set(rx, ry)
    texture.needsUpdate = true
    patternCache.set(key, texture)
  }
  return patternCache.get(key)
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * A line of Roblox-style stroked text.
 * @typedef {{ text: string, size?: number, color?: string, stroke?: string,
 *   strokeWidth?: number, weight?: number, gradient?: string[], bux?: boolean }} TextLine
 */

/** The Bloxity Bux logo's blue, and the colour of its cuts. */
const BUX_BLUE = '#1e90ff'
const BUX_CUT = '#10142c'
/** Directions of the logo's three cuts (radians, y down): up-right, down-right, left. */
const BUX_CUTS = [-Math.PI / 3, Math.PI / 3, Math.PI]

function drawBux(ctx, x, y, size) {
  // The Bux logo - a blue disc with a hub and three cuts - drawn so it never
  // depends on font coverage.
  const r = size * 0.42
  const cx = x + r
  const cy = y
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r + size * 0.07, 0, Math.PI * 2)
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = BUX_BLUE
  ctx.fill()
  ctx.strokeStyle = BUX_CUT
  ctx.lineCap = 'butt'
  ctx.lineWidth = r * 0.2
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.46, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = r * 0.24
  for (const a of BUX_CUTS) {
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r * 0.46, cy + Math.sin(a) * r * 0.46)
    ctx.lineTo(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05)
    ctx.stroke()
  }
  ctx.restore()
  return r * 2 + size * 0.14
}

function lineFont(line, scale) {
  return `${line.weight ?? 700} ${(line.size ?? 48) * scale}px "${FONT}", system-ui, sans-serif`
}

/** Draws stroked, optionally gradient-filled text lines centred in a box. */
export function drawTextLines(ctx, lines, cx, top, scale = 1) {
  let y = top
  for (const line of lines) {
    const size = (line.size ?? 48) * scale
    const stroke = (line.strokeWidth ?? size * 0.16) * 1
    ctx.font = lineFont(line, scale)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    const buxWidth = line.bux ? size * 0.96 : 0
    const textWidth = ctx.measureText(line.text).width
    let x = cx - (textWidth + buxWidth) / 2
    const midY = y + size * 0.6
    if (line.bux) x += drawBux(ctx, x, midY, size)
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    // `hue` turns the line's emoji (and any coloured text) round the colour wheel.
    ctx.filter = line.hue ? `hue-rotate(${line.hue}deg) saturate(2.2)` : 'none'
    if (stroke > 0) {
      ctx.lineWidth = stroke * 2
      ctx.strokeStyle = line.stroke ?? '#000'
      ctx.strokeText(line.text, x, midY)
    }
    if (line.gradient) {
      const grad = ctx.createLinearGradient(0, midY - size / 2, 0, midY + size / 2)
      line.gradient.forEach((c, i) => grad.addColorStop(i / (line.gradient.length - 1), c))
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = line.color ?? '#ffffff'
    }
    ctx.fillText(line.text, x, midY)
    ctx.filter = 'none'
    y += size * 1.2
  }
}

/** Measures lines so a billboard can be sized to its text. */
function measureLines(ctx, lines, scale) {
  let width = 0
  let height = 0
  for (const line of lines) {
    const size = (line.size ?? 48) * scale
    ctx.font = lineFont(line, scale)
    const w = ctx.measureText(line.text).width + (line.bux ? size * 0.96 : 0) + size * 0.4
    width = Math.max(width, w)
    height += size * 1.2
  }
  return { width, height }
}

/**
 * Billboard text texture (Roblox BillboardGui style: no background).
 * Returns { texture, aspect } where aspect = width / height.
 */
export function textTexture(lines) {
  const scale = 2
  const probe = makeCanvas(4, 4).getContext('2d')
  const { width, height } = measureLines(probe, lines, scale)
  const canvas = makeCanvas(Math.ceil(width + 16), Math.ceil(height + 16))
  const ctx = canvas.getContext('2d')
  drawTextLines(ctx, lines, canvas.width / 2, 8, scale)
  return { texture: toTexture(canvas, { repeat: false }), aspect: canvas.width / canvas.height }
}

/**
 * A panel sign (SurfaceGui style): rounded background, border, centred lines.
 * `width`/`height` are canvas pixels; keep them proportional to the world size.
 */
export function signTexture({
  width = 512,
  height = 256,
  bg = '#1ea0ff',
  bg2,
  border = '#f2c21b',
  borderWidth = 18,
  radius = 24,
  lines = [],
  studs = false,
  anime = false,
}) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (bg) {
    roundRect(ctx, 0, 0, width, height, radius)
    if (bg2) {
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, bg)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
    } else ctx.fillStyle = bg
    ctx.fill()
    if (studs) {
      ctx.save()
      ctx.clip()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 3
      for (let x = 0; x < width; x += 36)
        for (let y = 0; y < height; y += 36) {
          roundRect(ctx, x + 8, y + 8, 20, 20, 5)
          ctx.stroke()
        }
      ctx.restore()
    }
    if (anime) {
      ctx.save()
      roundRect(ctx, 0, 0, width, height, radius)
      ctx.clip()
      drawAnimeBackdrop(ctx, width, height, anime)
      ctx.restore()
    }
    if (borderWidth > 0) {
      roundRect(ctx, borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth, radius)
      ctx.lineWidth = borderWidth
      ctx.strokeStyle = border
      ctx.stroke()
      if (anime) drawMarquee(ctx, width, height, borderWidth, radius)
    }
  }
  const scale = 1
  const probe = measureLines(ctx, lines, scale)
  drawTextLines(ctx, lines, width / 2, (height - probe.height) / 2, scale)
  return toTexture(canvas, { repeat: false })
}

/**
 * Manga-style sign backdrop: speed lines bursting from the middle, halftone dots
 * in the corners and a jagged "impact" burst behind the title.
 * @param {{ burst?: string }} opts burst: colour of the impact star
 */
function drawAnimeBackdrop(ctx, w, h, opts) {
  const cx = w / 2
  const cy = h / 2
  const rand = rng(w * 31 + h)
  // Speed lines.
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  const rays = 44
  for (let i = 0; i < rays; i += 1) {
    const a = (i / rays) * Math.PI * 2 + rand() * 0.05
    const spread = 0.012 + rand() * 0.02
    const inner = h * (0.35 + rand() * 0.15)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.6)
    ctx.lineTo(cx + Math.cos(a - spread) * w, cy + Math.sin(a - spread) * w)
    ctx.lineTo(cx + Math.cos(a + spread) * w, cy + Math.sin(a + spread) * w)
    ctx.closePath()
    ctx.fill()
  }
  // Halftone dots, growing toward the corners.
  const step = Math.max(10, Math.round(h / 18))
  ctx.fillStyle = 'rgba(0,0,40,0.18)'
  for (let y = step / 2; y < h; y += step)
    for (let x = step / 2; x < w; x += step) {
      const dx = Math.abs(x - cx) / cx
      const dy = Math.abs(y - cy) / cy
      const d = Math.max(0, Math.min(1, dx * dy * 1.6))
      if (d < 0.08) continue
      ctx.beginPath()
      ctx.arc(x, y, (step / 2) * d, 0, Math.PI * 2)
      ctx.fill()
    }
  // Impact burst behind the title.
  if (opts.burst) {
    const spikes = 18
    ctx.beginPath()
    for (let i = 0; i < spikes * 2; i += 1) {
      const a = (i / (spikes * 2)) * Math.PI * 2
      const r = i % 2 ? 0.3 : 0.44 + rand() * 0.06
      ctx.lineTo(cx + Math.cos(a) * w * r, cy + Math.sin(a) * h * r * 1.5)
    }
    ctx.closePath()
    ctx.fillStyle = opts.burst
    ctx.fill()
    ctx.lineWidth = Math.max(4, h / 60)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.stroke()
  }
}

/** Light bulbs running round a sign's border, like a marquee. */
function drawMarquee(ctx, w, h, borderWidth, radius) {
  const inset = borderWidth / 2
  const r = borderWidth * 0.3
  const gap = borderWidth * 1.6
  const bulb = (x, y, i) => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2)
    const colour = i % 2 ? '#fff6c2' : '#ffffff'
    glow.addColorStop(0, colour)
    glow.addColorStop(0.45, i % 2 ? 'rgba(255,220,80,0.9)' : 'rgba(255,255,255,0.9)')
    glow.addColorStop(1, 'rgba(255,200,60,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  let i = 0
  for (let x = inset + radius; x <= w - inset - radius; x += gap) {
    bulb(x, inset, i++)
    bulb(x, h - inset, i++)
  }
  for (let y = inset + radius; y <= h - inset - radius; y += gap) {
    bulb(inset, y, i++)
    bulb(w - inset, y, i++)
  }
}

// ---------------------------------------------------------------------------
// One-off art
// ---------------------------------------------------------------------------

/** The spawn pad: a black spiky sun on white, like the one in the lobby. */
export function spawnStarTexture() {
  const size = 512
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#eceaf7'
  ctx.fillRect(0, 0, size, size)
  const c = size / 2
  ctx.fillStyle = '#141414'
  const spikes = 8
  for (let i = 0; i < spikes; i += 1) {
    const a = (i / spikes) * Math.PI * 2 + 0.2
    ctx.beginPath()
    // Curved blade: base on the ring, tip swept sideways.
    const base1 = a - 0.22
    const base2 = a + 0.22
    const tipA = a + 0.35
    ctx.moveTo(c + Math.cos(base1) * 70, c + Math.sin(base1) * 70)
    ctx.quadraticCurveTo(
      c + Math.cos(a) * 150,
      c + Math.sin(a) * 150,
      c + Math.cos(tipA) * 240,
      c + Math.sin(tipA) * 240,
    )
    ctx.quadraticCurveTo(
      c + Math.cos(a + 0.3) * 140,
      c + Math.sin(a + 0.3) * 140,
      c + Math.cos(base2) * 70,
      c + Math.sin(base2) * 70,
    )
    ctx.closePath()
    ctx.fill()
  }
  ctx.lineWidth = 26
  ctx.strokeStyle = '#141414'
  ctx.beginPath()
  ctx.arc(c, c, 82, 0, Math.PI * 2)
  ctx.stroke()
  return toTexture(canvas, { repeat: false })
}

/** Screen for the teleport machine / treadmill consoles. */
export function screenTexture(color = '#35ff9a') {
  const canvas = makeCanvas(128, 96)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0b1622'
  ctx.fillRect(0, 0, 128, 96)
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(8, 60)
  for (let x = 8; x < 120; x += 8) ctx.lineTo(x, 60 - Math.sin(x / 9) * 18 - (x % 24 === 0 ? 14 : 0))
  ctx.stroke()
  ctx.fillStyle = color
  ctx.fillRect(10, 76, 50, 8)
  return toTexture(canvas, { repeat: false })
}

// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export { makeCanvas, roundRect, toTexture }

/** Glowing ">>>" arrows painted on the stage walkways, pointing the way forward. */
export function chevronTexture(color = '#ffd23f') {
  const key = `chevron|${color}`
  if (patternCache.has(key)) return patternCache.get(key)
  const canvas = makeCanvas(128, 256)
  const ctx = canvas.getContext('2d')
  ctx.lineJoin = 'round'
  for (let i = 0; i < 3; i += 1) {
    const y = 40 + i * 70
    ctx.beginPath()
    ctx.moveTo(14, y + 44)
    ctx.lineTo(64, y)
    ctx.lineTo(114, y + 44)
    ctx.lineTo(114, y + 70)
    ctx.lineTo(64, y + 26)
    ctx.lineTo(14, y + 70)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.globalAlpha = 1 - i * 0.25
    ctx.fill()
  }
  const texture = toTexture(canvas, { repeat: false })
  patternCache.set(key, texture)
  return texture
}
