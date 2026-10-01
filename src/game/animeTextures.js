import { makeCanvas, roundRect, toTexture } from './textures'

/**
 * Canvas art for the anime characters: the face (wrapped round a cylinder head,
 * like a Roblox R6 head) and the clothing patterns (Roblox "shirts" and "pants").
 */

/** Deterministic PRNG so every character looks the same on every load. */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hashString(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const cache = new Map()
function cached(key, draw, width, height) {
  if (!cache.has(key)) {
    const canvas = makeCanvas(width, height)
    draw(canvas.getContext('2d'), width, height)
    cache.set(key, toTexture(canvas, { repeat: false }))
  }
  return cache.get(key)
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

/**
 * The head is a cylinder whose texture wraps all the way round with the front at
 * u = 0.5, so the face is drawn in the middle quarter of a wide canvas.
 */
/** Mix a hex colour toward white by f (0..1). */
function lighten(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c) => Math.round(c + (255 - c) * f)
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
}

export const FACE_W = 448
export const FACE_H = 128

export function faceTexture(look) {
  const face = look.face || {}
  const key = `face|${look.skin}|${JSON.stringify(face)}`
  return cached(
    key,
    (ctx, w, h) => {
      ctx.fillStyle = look.skin
      ctx.fillRect(0, 0, w, h)
      // Soft shading toward the back of the head.
      const shade = ctx.createLinearGradient(0, 0, w, 0)
      shade.addColorStop(0, 'rgba(0,0,0,0.12)')
      shade.addColorStop(0.3, 'rgba(0,0,0,0)')
      shade.addColorStop(0.7, 'rgba(0,0,0,0)')
      shade.addColorStop(1, 'rgba(0,0,0,0.12)')
      ctx.fillStyle = shade
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const eyeY = 64

      if (!face.covered) {
        for (const side of [-1, 1]) {
          const ex = cx + side * 25
          // Brow, slanted in for the anime scowl.
          ctx.strokeStyle = face.brow || '#1b1414'
          ctx.lineWidth = 5
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(ex - 13 * side, eyeY - 22)
          ctx.lineTo(ex + 12 * side, eyeY - 16 + (face.angry ? 5 : 0))
          ctx.stroke()
          // Eye white: big and tall, anime style.
          ctx.fillStyle = '#ffffff'
          roundRect(ctx, ex - 13, eyeY - 11, 26, 25, 10)
          ctx.fill()
          // Iris: dark at the top fading to a bright rim of colour below.
          const iris = face.eyes || '#333333'
          const grad = ctx.createLinearGradient(0, eyeY - 10, 0, eyeY + 13)
          grad.addColorStop(0, '#120a10')
          grad.addColorStop(0.45, iris)
          grad.addColorStop(1, lighten(iris, 0.55))
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.ellipse(ex - side * 1, eyeY + 2, 9, 12, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(10,6,12,0.9)'
          ctx.beginPath()
          ctx.ellipse(ex - side * 1, eyeY + 2, 4, 6.5, 0, 0, Math.PI * 2)
          ctx.fill()
          // Two catch-lights: a big one up top, a small one below.
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.ellipse(ex - side * 1 - 3.5, eyeY - 3, 3.6, 4.4, -0.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 0.85
          ctx.beginPath()
          ctx.arc(ex - side * 1 + 3.5, eyeY + 8, 1.8, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          // Heavy upper lash line with a flick at the outer corner.
          ctx.strokeStyle = '#140c10'
          ctx.lineWidth = 5
          ctx.beginPath()
          ctx.moveTo(ex - 14 * side, eyeY - 7)
          ctx.quadraticCurveTo(ex, eyeY - 15, ex + 14 * side, eyeY - 10)
          ctx.lineTo(ex + 18 * side, eyeY - 13)
          ctx.stroke()
          if (face.blush) {
            ctx.fillStyle = 'rgba(255,110,140,0.35)'
            ctx.beginPath()
            ctx.ellipse(ex + side * 6, eyeY + 22, 10, 4, 0, 0, Math.PI * 2)
            ctx.fill()
          }

          if (face.marks) {
            // Twin lines under each eye.
            ctx.strokeStyle = '#141414'
            ctx.lineWidth = 3
            for (const dy of [19, 26]) {
              ctx.beginPath()
              ctx.moveTo(ex - 10, eyeY + dy)
              ctx.lineTo(ex + 10, eyeY + dy)
              ctx.stroke()
            }
          }
          if (face.whiskers) {
            ctx.strokeStyle = '#5a3a2a'
            ctx.lineWidth = 3
            for (let i = 0; i < 3; i += 1) {
              ctx.beginPath()
              ctx.moveTo(cx + side * 28, eyeY + 22 + i * 7)
              ctx.lineTo(cx + side * 52, eyeY + 20 + i * 8)
              ctx.stroke()
            }
          }
        }
      }
      if (face.scar) {
        ctx.fillStyle = '#8a2a2a'
        ctx.beginPath()
        ctx.ellipse(cx - 30, eyeY - 30, 11, 7, 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      // Mouth
      ctx.strokeStyle = '#4a2222'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (face.grin) {
        ctx.moveTo(cx - 12, eyeY + 36)
        ctx.quadraticCurveTo(cx, eyeY + 46, cx + 12, eyeY + 36)
      } else {
        ctx.moveTo(cx - 8, eyeY + 40)
        ctx.lineTo(cx + 8, eyeY + 40)
      }
      ctx.stroke()
    },
    FACE_W,
    FACE_H,
  )
}

// ---------------------------------------------------------------------------
// Clothing
// ---------------------------------------------------------------------------

const PATTERNS = {
  plain(ctx, w, h, { color }) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
  },

  /** Dark uniform with lighter fold lines, like the Jujutsu High uniforms. */
  creases(ctx, w, h, { color, color2 }, rand) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = color2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // A few long sweeping folds, each ending in a sharp hook, spread down the part.
    for (let i = 0; i < 6; i += 1) {
      const x = 8 + rand() * (w * 0.35)
      const y = 12 + i * (h / 6) + rand() * 8
      const len = 45 + rand() * 50
      const bend = (rand() - 0.5) * 30
      const endY = y + (rand() - 0.5) * 16
      ctx.lineWidth = 3.5 + rand() * 3
      ctx.globalAlpha = 0.75 + rand() * 0.25
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + len / 2, y + bend, x + len, endY)
      ctx.lineTo(x + len - 12, endY + 11)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },

  /** White kimono with black tiger stripes. */
  tiger(ctx, w, h, { color, color2 }, rand) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color2
    for (let i = 0; i < 7; i += 1) {
      const y = 8 + i * 17 + rand() * 6
      const fromLeft = i % 2 === 0
      const len = 30 + rand() * 40
      ctx.beginPath()
      if (fromLeft) {
        ctx.moveTo(0, y - 5)
        ctx.lineTo(len, y)
        ctx.lineTo(0, y + 6)
      } else {
        ctx.moveTo(w, y - 5)
        ctx.lineTo(w - len, y)
        ctx.lineTo(w, y + 6)
      }
      ctx.fill()
    }
  },

  checker(ctx, w, h, { color, color2 }) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color2
    const n = 4
    for (let x = 0; x < n; x += 1)
      for (let y = 0; y < n; y += 1) if ((x + y) % 2) ctx.fillRect((x * w) / n, (y * h) / n, w / n, h / n)
  },

  /** White haori with red-orange flames licking up from the hem. */
  flames(ctx, w, h, { color, color2 }) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color2
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x + 8, h * 0.42 + ((x / 16) % 2) * 20)
      ctx.lineTo(x + 16, h * 0.75)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffcf2e'
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x + 8, h * 0.7 + ((x / 16) % 2) * 10)
      ctx.lineTo(x + 16, h * 0.88)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
  },

  /** Orange haori covered in white triangles (the thunder breather). */
  triangles(ctx, w, h, { color, color2 }) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color2
    const n = 4
    const s = w / n
    for (let row = 0; row < n; row += 1)
      for (let col = 0; col < n; col += 1) {
        const x = col * s + (row % 2) * (s / 2)
        const y = row * s
        ctx.beginPath()
        ctx.moveTo(x + s * 0.2, y + s * 0.8)
        ctx.lineTo(x + s * 0.5, y + s * 0.2)
        ctx.lineTo(x + s * 0.8, y + s * 0.8)
        ctx.closePath()
        ctx.fill()
      }
  },

  /** White-to-purple gradient haori with butterfly wings. */
  butterfly(ctx, w, h, { color, color2 }) {
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, color)
    grad.addColorStop(1, color2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    for (const [x, y] of [
      [36, 46],
      [92, 88],
    ]) {
      ctx.beginPath()
      ctx.ellipse(x - 8, y, 9, 13, -0.5, 0, Math.PI * 2)
      ctx.ellipse(x + 8, y, 9, 13, 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
  },

  /** Black with white splatter (the shadow character). */
  speckle(ctx, w, h, { color, color2 }, rand) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color2
    for (let i = 0; i < 40; i += 1) {
      const r = 1.5 + rand() * 5
      ctx.globalAlpha = 0.5 + rand() * 0.5
      ctx.beginPath()
      ctx.ellipse(rand() * w, rand() * h, r, r * (0.4 + rand()), rand() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  },

  /** Main colour with a band of color2 across the shoulders. */
  shoulders(ctx, w, h, { color, color2 }) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color2
    ctx.fillRect(0, 0, w, h * 0.38)
  },

  /** Superhero suit: black with coloured shoulders and a chest stripe. */
  hero(ctx, w, h, { color, color2, color3 = '#ffd21f' }) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color2
    ctx.fillRect(0, 0, w, h * 0.3)
    ctx.fillStyle = color3
    ctx.fillRect(w * 0.42, 0, w * 0.16, h)
  },

  clouds(ctx, w, h, { color }) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    for (const [x, y] of [
      [30, 40],
      [90, 80],
      [40, 105],
    ]) {
      for (const [fill, grow] of [
        ['#ffffff', 2],
        ['#d0101a', -1],
      ]) {
        ctx.fillStyle = fill
        for (const [dx, dy, r] of [
          [0, 0, 13],
          [14, -4, 11],
          [-13, 3, 10],
        ]) {
          ctx.beginPath()
          ctx.arc(x + dx, y + dy, r + grow, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  },
}

/**
 * @param {{ color: string, pattern?: string, color2?: string, color3?: string }} cloth
 * @param {{ front?: string }} [opts] front: colour of an open haori's inner strip
 */
export function clothTexture(cloth, { front } = {}) {
  const key = `cloth|${JSON.stringify(cloth)}|${front || ''}`
  return cached(
    key,
    (ctx, w, h) => {
      const draw = PATTERNS[cloth.pattern || 'plain'] || PATTERNS.plain
      draw(ctx, w, h, cloth, rng(hashString(key)))
      if (front) {
        // Open coat: the uniform shows through down the middle.
        ctx.fillStyle = front
        ctx.fillRect(w * 0.3, 0, w * 0.4, h)
      }
      // Roblox-style shading: slightly darker toward the bottom and edges.
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(255,255,255,0.06)')
      grad.addColorStop(1, 'rgba(0,0,0,0.18)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 3
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3)
    },
    128,
    128,
  )
}
