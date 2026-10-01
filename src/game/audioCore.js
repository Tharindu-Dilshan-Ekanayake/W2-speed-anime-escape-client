/**
 * Shared Web Audio plumbing for sfx.js and music.js: one AudioContext, one
 * limiter every bus feeds into, and one mute flag both respect.
 *
 * The context is created lazily and resumed on the first key press or click,
 * since browsers keep audio locked until the player interacts with the page.
 */

const MUTE_KEY = 'w2sae:muted'

let ctx = null
let limiter = null
let sharedNoise = null
let muted = readMuted()
const muteListeners = new Set()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

/** The shared AudioContext, created (and resumed) on first use. */
export function audio() {
  if (!ctx) {
    const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!Ctor) return null
    ctx = new Ctor()
    limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.ratio.value = 8
    limiter.connect(ctx.destination)
    sharedNoise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = sharedNoise.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Every bus (sfx master, music layers...) connects here, which feeds the limiter. */
export const destination = () => limiter

/** One shared white-noise buffer, reused by every noise burst in sfx and music. */
export const noiseBuffer = () => sharedNoise

if (typeof window !== 'undefined') {
  const unlock = () => audio()
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

export const isMuted = () => muted

export function setMuted(value) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // Private mode: the choice just isn't remembered.
  }
  for (const fn of muteListeners) fn(value)
}

/** Called with the new value whenever setMuted() changes the flag. */
export function onMuteChange(fn) {
  muteListeners.add(fn)
  return () => muteListeners.delete(fn)
}

export default audio
