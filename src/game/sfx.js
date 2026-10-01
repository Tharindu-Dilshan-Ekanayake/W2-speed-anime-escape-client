/**
 * Anime-style sound effects, synthesised with Web Audio (no audio files).
 *
 * Every sound is a few oscillators and filtered noise bursts scheduled on the
 * audio clock. Shares its AudioContext (and mute flag) with music.js via
 * audioCore - see that file for the context / limiter / unlock plumbing.
 */

import { audio, destination, isMuted, noiseBuffer as sharedNoise, onMuteChange, setMuted } from './audioCore'

export { isMuted, setMuted }

const MASTER_VOLUME = 0.55

/** This bus's own gain, created lazily once the context exists. */
let master = null
function bus(ac) {
  if (!master) {
    master = ac.createGain()
    master.gain.value = isMuted() ? 0 : MASTER_VOLUME
    master.connect(destination())
    onMuteChange((muted) => master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ac.currentTime, 0.02))
  }
  return master
}

/** Per-sound cooldowns, so a burst of events doesn't stack into noise. */
const lastPlayed = new Map()

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Attack / exponential-decay envelope on a fresh gain node. */
function envelope(ac, at, vol, attack, dur) {
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(vol, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur)
  g.connect(bus(ac))
  return g
}

/**
 * An oscillator sliding from f0 to f1.
 * @param {{ type?: OscillatorType, f0: number, f1?: number, at?: number, dur: number,
 *   vol?: number, attack?: number, vibrato?: number, filter?: number }} o
 */
function tone(o) {
  const ac = audio()
  if (!ac || isMuted()) return
  const at = ac.currentTime + (o.at || 0)
  const osc = ac.createOscillator()
  osc.type = o.type || 'sine'
  osc.frequency.setValueAtTime(o.f0, at)
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, at + o.dur)
  if (o.vibrato) {
    const lfo = ac.createOscillator()
    const depth = ac.createGain()
    lfo.frequency.value = 7
    depth.gain.value = o.vibrato
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(at)
    lfo.stop(at + o.dur + 0.1)
  }
  let node = osc
  if (o.filter) {
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = o.filter
    node = node.connect(lp)
  }
  node.connect(envelope(ac, at, o.vol ?? 0.2, o.attack ?? 0.005, o.dur))
  osc.start(at)
  osc.stop(at + (o.attack ?? 0.005) + o.dur + 0.05)
}

/**
 * Filtered white noise, the filter frequency sliding from f0 to f1.
 * @param {{ type?: BiquadFilterType, f0: number, f1?: number, q?: number, at?: number,
 *   dur: number, vol?: number, attack?: number }} o
 */
function noise(o) {
  const ac = audio()
  if (!ac || isMuted()) return
  const at = ac.currentTime + (o.at || 0)
  const src = ac.createBufferSource()
  src.buffer = sharedNoise()
  src.loop = true
  const filter = ac.createBiquadFilter()
  filter.type = o.type || 'bandpass'
  filter.Q.value = o.q ?? 1
  filter.frequency.setValueAtTime(o.f0, at)
  if (o.f1) filter.frequency.exponentialRampToValueAtTime(o.f1, at + o.dur)
  src.connect(filter).connect(envelope(ac, at, o.vol ?? 0.2, o.attack ?? 0.005, o.dur))
  src.start(at, Math.random() * 0.5)
  src.stop(at + (o.attack ?? 0.005) + o.dur + 0.05)
}

/** False while `name` played less than `gap` seconds ago. */
function ready(name, gap) {
  const now = performance.now()
  if (now - (lastPlayed.get(name) ?? -1e9) < gap * 1000) return false
  lastPlayed.set(name, now)
  return true
}

const NOTE = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12)

/** A twinkling "kira-kira" run of high bell notes. */
function sparkle(at = 0, count = 5, base = 2093, vol = 0.05) {
  for (let i = 0; i < count; i += 1) {
    const f = base * Math.pow(2, ((i * 5) % 12) / 12)
    tone({ type: 'sine', f0: f, at: at + i * 0.045, dur: 0.22, vol })
    tone({ type: 'sine', f0: f * 2.01, at: at + i * 0.045, dur: 0.12, vol: vol * 0.4 })
  }
}

// ---------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------

export const sfx = {
  /** "Hup!" with a whoosh of air. */
  jump() {
    if (!ready('jump', 0.08)) return
    noise({ type: 'bandpass', f0: 700, f1: 2600, q: 1.2, dur: 0.18, vol: 0.16, attack: 0.02 })
    tone({ type: 'triangle', f0: 380, f1: 820, dur: 0.12, vol: 0.09 })
  },

  /** Airborne second jump: a bright magical flip. */
  doubleJump() {
    if (!ready('djump', 0.08)) return
    noise({ type: 'highpass', f0: 2500, f1: 6000, dur: 0.2, vol: 0.12, attack: 0.02 })
    tone({ type: 'sine', f0: 900, f1: 1900, dur: 0.14, vol: 0.08 })
    sparkle(0.05, 3, 2637, 0.035)
  },

  /** Soft thump on landing, heavier from higher up. */
  land(strength = 1) {
    if (!ready('land', 0.12)) return
    const v = Math.min(1, strength)
    noise({ type: 'lowpass', f0: 500, f1: 120, dur: 0.12, vol: 0.12 + 0.12 * v })
    tone({ type: 'sine', f0: 140, f1: 55, dur: 0.12, vol: 0.1 + 0.12 * v })
  },

  /** A light footfall tap (alternating feet sound a touch different). */
  step(alt = false, fast = 0) {
    noise({ type: 'bandpass', f0: alt ? 1500 : 1900, q: 2.5, dur: 0.035, vol: 0.035 + 0.02 * fast })
    tone({ type: 'sine', f0: alt ? 95 : 110, f1: 60, dur: 0.05, vol: 0.04 })
  },

  /** Anime punch impact: "DOOSH". */
  hit() {
    if (!ready('hit', 0.1)) return
    noise({ type: 'lowpass', f0: 3000, f1: 180, dur: 0.28, vol: 0.45 })
    tone({ type: 'sine', f0: 190, f1: 42, dur: 0.3, vol: 0.5 })
    tone({ type: 'square', f0: 90, f1: 50, dur: 0.08, vol: 0.12, filter: 900 })
  },

  /** Knocked out: a dramatic falling "pyuuu" and a crash. */
  death() {
    if (!ready('death', 0.5)) return
    noise({ type: 'lowpass', f0: 2500, f1: 150, dur: 0.45, vol: 0.4 })
    tone({ type: 'sine', f0: 170, f1: 38, dur: 0.4, vol: 0.45 })
    tone({ type: 'sawtooth', f0: 900, f1: 110, at: 0.05, dur: 0.7, vol: 0.12, filter: 2200 })
    tone({ type: 'triangle', f0: 1200, f1: 180, at: 0.05, dur: 0.7, vol: 0.08 })
  },

  /** Level up: rising arpeggio and a shimmer. */
  levelUp() {
    if (!ready('level', 0.25)) return
    const notes = [3, 7, 10, 15] // C5 E5 G5 C6 (from A4)
    notes.forEach((n, i) => {
      tone({ type: 'triangle', f0: NOTE(n + 12), at: i * 0.07, dur: 0.25, vol: 0.13 })
      tone({ type: 'sine', f0: NOTE(n + 24), at: i * 0.07, dur: 0.18, vol: 0.05 })
    })
    tone({ type: 'sine', f0: NOTE(27), at: 0.3, dur: 0.6, vol: 0.08, vibrato: 12 })
    sparkle(0.28, 5, 2093, 0.04)
  },

  /** Stage cleared: a little victory fanfare. */
  win() {
    if (!ready('win', 0.4)) return
    const seq = [
      [-2, 0, 0.12],
      [3, 0.12, 0.12],
      [7, 0.24, 0.12],
      [10, 0.36, 0.55],
    ]
    for (const [n, at, dur] of seq) {
      tone({ type: 'square', f0: NOTE(n + 12), at, dur, vol: 0.06, filter: 3500 })
      tone({ type: 'triangle', f0: NOTE(n + 12), at, dur: dur + 0.1, vol: 0.12 })
    }
    for (const n of [3, 7, 10]) tone({ type: 'triangle', f0: NOTE(n), at: 0.36, dur: 0.7, vol: 0.07 })
    sparkle(0.4, 7, 2349, 0.04)
  },

  /** Rebirth: a huge power-up surge into a chord. */
  rebirth() {
    if (!ready('rebirth', 1)) return
    noise({ type: 'bandpass', f0: 200, f1: 4000, q: 1.5, dur: 1.1, vol: 0.25, attack: 0.3 })
    tone({ type: 'sawtooth', f0: 110, f1: 880, dur: 1.1, vol: 0.1, attack: 0.3, filter: 2500 })
    for (const n of [3, 7, 10, 15]) tone({ type: 'triangle', f0: NOTE(n + 12), at: 1.1, dur: 1.1, vol: 0.08, vibrato: 6 })
    tone({ type: 'sine', f0: 70, f1: 40, at: 1.1, dur: 0.8, vol: 0.4 })
    sparkle(1.15, 8, 2093, 0.05)
  },

  /** Something bought: "ka-ching". */
  buy() {
    if (!ready('buy', 0.15)) return
    tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.07, filter: 5000 })
    tone({ type: 'square', f0: 1319, at: 0.07, dur: 0.3, vol: 0.07, filter: 5000 })
    sparkle(0.1, 3, 2637, 0.035)
  },

  /** Becoming another anime: a transformation "shiiin" and a boom of power. */
  transform() {
    if (!ready('transform', 0.3)) return
    noise({ type: 'highpass', f0: 1500, f1: 7000, dur: 0.5, vol: 0.14, attack: 0.15 })
    tone({ type: 'sine', f0: 600, f1: 1800, dur: 0.45, vol: 0.08, attack: 0.1 })
    tone({ type: 'sine', f0: 90, f1: 40, at: 0.45, dur: 0.5, vol: 0.4 })
    noise({ type: 'lowpass', f0: 1200, f1: 100, at: 0.45, dur: 0.4, vol: 0.25 })
    sparkle(0.45, 5, 2349, 0.04)
  },


  /** Falling into the sea / lava: a big splash. */
  splash() {
    if (!ready('splash', 0.4)) return
    noise({ type: 'lowpass', f0: 2400, f1: 300, dur: 0.6, vol: 0.35, attack: 0.01 })
    noise({ type: 'bandpass', f0: 900, f1: 2600, q: 0.8, at: 0.05, dur: 0.4, vol: 0.12 })
    tone({ type: 'sine', f0: 220, f1: 60, dur: 0.35, vol: 0.25 })
  },

  /** Locked gate / can't afford: a low double buzz. */
  deny() {
    if (!ready('deny', 0.35)) return
    tone({ type: 'square', f0: 150, f1: 120, dur: 0.12, vol: 0.08, filter: 900 })
    tone({ type: 'square', f0: 150, f1: 110, at: 0.14, dur: 0.16, vol: 0.08, filter: 900 })
  },

  /** Wins paid out: a shower of coins. */
  coins(count = 6) {
    if (!ready('coins', 0.3)) return
    for (let i = 0; i < count; i += 1) {
      const f = 1800 + ((i * 7) % 5) * 260
      tone({ type: 'square', f0: f, at: i * 0.06, dur: 0.08, vol: 0.04, filter: 6000 })
      tone({ type: 'sine', f0: f * 1.5, at: i * 0.06 + 0.03, dur: 0.18, vol: 0.05 })
    }
    sparkle(count * 0.06, 5, 2349, 0.04)
  },

  /** A gift box opening. */
  gift() {
    if (!ready('gift', 0.5)) return
    noise({ type: 'highpass', f0: 2000, f1: 6000, dur: 0.25, vol: 0.1, attack: 0.02 })
    ;[0, 4, 7, 12, 16].forEach((n, i) => tone({ type: 'triangle', f0: NOTE(n + 15), at: 0.1 + i * 0.06, dur: 0.3, vol: 0.1 }))
    sparkle(0.4, 8, 2637, 0.04)
  },

  /** A speed trial starts: siren + rumble. */
  trialStart() {
    if (!ready('trialStart', 1)) return
    for (let i = 0; i < 3; i += 1) {
      tone({ type: 'sawtooth', f0: 660, f1: 990, at: i * 0.32, dur: 0.16, vol: 0.06, filter: 2400 })
      tone({ type: 'sawtooth', f0: 990, f1: 660, at: i * 0.32 + 0.16, dur: 0.16, vol: 0.06, filter: 2400 })
    }
    noise({ type: 'lowpass', f0: 400, f1: 90, dur: 1.2, vol: 0.25, attack: 0.2 })
  },

  /** Trial cleared. */
  trialClear() {
    if (!ready('trialClear', 0.8)) return
    ;[3, 7, 10, 15, 19].forEach((n, i) => tone({ type: 'triangle', f0: NOTE(n + 12), at: i * 0.07, dur: 0.35, vol: 0.11 }))
    sparkle(0.35, 6, 2349, 0.045)
  },

  /** Passing an open stage gate. */
  gate() {
    if (!ready('gate', 1)) return
    noise({ type: 'bandpass', f0: 600, f1: 4000, q: 2, dur: 0.5, vol: 0.1, attack: 0.08 })
    tone({ type: 'sine', f0: 440, f1: 1320, dur: 0.45, vol: 0.06, attack: 0.05 })
    sparkle(0.3, 5, 2093, 0.04)
  },

  /** UI button. */
  click() {
    if (!ready('click', 0.04)) return
    tone({ type: 'sine', f0: 900, f1: 650, dur: 0.05, vol: 0.08 })
  },

  /** Stage checkpoint / gate: a katana "shing". */
  checkpoint() {
    if (!ready('checkpoint', 0.5)) return
    noise({ type: 'bandpass', f0: 5500, f1: 8000, q: 6, dur: 0.35, vol: 0.14, attack: 0.01 })
    for (const [f, v] of [
      [2400, 0.05],
      [3610, 0.04],
      [5230, 0.03],
    ])
      tone({ type: 'sine', f0: f, dur: 0.6, vol: v, attack: 0.01 })
  },

  /** The "!" alert sting for danger ("RUN!"). */
  alert() {
    if (!ready('alert', 0.6)) return
    tone({ type: 'sine', f0: 1760, dur: 0.18, vol: 0.12 })
    tone({ type: 'sine', f0: 2637, at: 0.02, dur: 0.14, vol: 0.06 })
    tone({ type: 'sawtooth', f0: 110, at: 0.12, dur: 0.18, vol: 0.12, filter: 900 })
    tone({ type: 'sawtooth', f0: 104, at: 0.34, dur: 0.5, vol: 0.14, filter: 900 })
    tone({ type: 'sine', f0: 55, at: 0.34, dur: 0.5, vol: 0.25 })
  },

  /** Teleport / respawn swoosh. */
  teleport() {
    if (!ready('teleport', 0.3)) return
    noise({ type: 'bandpass', f0: 400, f1: 3500, q: 2, dur: 0.35, vol: 0.14, attack: 0.05 })
    tone({ type: 'sine', f0: 300, f1: 1500, dur: 0.3, vol: 0.07, attack: 0.05 })
    sparkle(0.2, 3, 2093, 0.03)
  },

  /** A dragon's roar. */
  roar() {
    if (!ready('roar', 1.2)) return
    noise({ type: 'lowpass', f0: 900, f1: 250, q: 3, dur: 0.9, vol: 0.28, attack: 0.12 })
    tone({ type: 'sawtooth', f0: 95, f1: 55, dur: 0.9, vol: 0.13, attack: 0.1, filter: 600, vibrato: 9 })
    tone({ type: 'sawtooth', f0: 142, f1: 80, dur: 0.8, vol: 0.07, attack: 0.1, filter: 700, vibrato: 11 })
  },

  /** Fireball launch. */
  fireball() {
    if (!ready('fireball', 0.15)) return
    noise({ type: 'bandpass', f0: 300, f1: 1400, q: 0.8, dur: 0.4, vol: 0.14, attack: 0.04 })
  },

  /** Lightning crack and rumble. */
  thunder() {
    if (!ready('thunder', 0.2)) return
    noise({ type: 'highpass', f0: 3000, f1: 800, dur: 0.12, vol: 0.3 })
    noise({ type: 'lowpass', f0: 600, f1: 80, at: 0.05, dur: 0.8, vol: 0.3, attack: 0.03 })
  },

  /** A blast of wind from the wall fans. */
  gust() {
    if (!ready('gust', 0.6)) return
    noise({ type: 'bandpass', f0: 250, f1: 1100, q: 0.7, dur: 1.3, vol: 0.14, attack: 0.25 })
    noise({ type: 'highpass', f0: 2500, f1: 4500, dur: 1, vol: 0.04, attack: 0.3 })
  },

  /** A giant shuriken launched: a metallic "shing" spinning away. */
  shuriken() {
    if (!ready('shuriken', 0.25)) return
    noise({ type: 'bandpass', f0: 6000, f1: 3000, q: 4, dur: 0.25, vol: 0.06 })
    tone({ type: 'sine', f0: 2800, f1: 2200, dur: 0.3, vol: 0.025 })
  },

  /** A pendulum blade sweeping past. */
  swish() {
    if (!ready('swish', 0.2)) return
    noise({ type: 'bandpass', f0: 500, f1: 2200, q: 1.5, dur: 0.3, vol: 0.12, attack: 0.08 })
  },

  /** Stone cracking under the feet (a floor about to fall). */
  crack() {
    if (!ready('crack', 0.15)) return
    noise({ type: 'bandpass', f0: 1200, f1: 400, q: 1.5, dur: 0.18, vol: 0.18 })
    tone({ type: 'square', f0: 70, f1: 45, dur: 0.1, vol: 0.06, filter: 500 })
  },
}

export default sfx

// ---------------------------------------------------------------------------
// Wind: a looping rush of air that swells with running speed.
// ---------------------------------------------------------------------------

let windGain = null
let windFilter = null
let windLast = -1
/** 0 (standing) .. 1 (flat out). Call every frame. */
export function setWind(level) {
  const ac = audio()
  if (!ac || ac.state !== 'running') return
  if (!windGain) {
    const src = ac.createBufferSource()
    src.buffer = sharedNoise()
    src.loop = true
    windFilter = ac.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.Q.value = 0.7
    windFilter.frequency.value = 500
    windGain = ac.createGain()
    windGain.gain.value = 0
    src.connect(windFilter).connect(windGain).connect(bus(ac))
    src.start()
  }
  const v = Math.max(0, Math.min(1, level))
  // Called every frame: only touch the audio graph when the level really moved
  // (a flood of scheduled parameter changes makes the audio thread stutter).
  if (Math.abs(v - windLast) < 0.04 && !(v === 0 && windLast !== 0)) return
  windLast = v
  windGain.gain.setTargetAtTime(isMuted() ? 0 : v * v * 0.09, ac.currentTime, 0.15)
  windFilter.frequency.setTargetAtTime(400 + v * 1400, ac.currentTime, 0.2)
}
