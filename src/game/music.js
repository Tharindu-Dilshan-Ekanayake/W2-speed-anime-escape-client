/**
 * Anime-style background music, synthesised with Web Audio (no audio files) -
 * the same approach as sfx.js, sharing its AudioContext via audioCore.
 *
 * Two whole "bands" play in the background at all times, each on its own gain
 * bus: a calm but uplifting anime-opening style song for the hub (intro, verse,
 * chorus and breakdown over the "royal road" chord progression) and a driving
 * battle theme for the stages (bass, drums, two alternating pentatonic riffs). Both share the same key (D), so crossfading their bus gains
 * as the player enters/leaves a stage sounds like a mode shift, not a scene cut -
 * classic adaptive game-score layering. A third, silent-until-needed "tension"
 * accent (urgent pings over the battle beat) fades in while the cursed wave (or
 * anything else that sets store.danger) is chasing the player.
 */

import { audio, destination, isMuted, noiseBuffer, onMuteChange } from './audioCore'
import { runtime } from './runtime'
import { useGame } from './store'

const MUSIC_VOLUME = 0.03

/** How far ahead notes are scheduled every tick, and how often we tick. */
const LOOKAHEAD = 0.12
const TICK_MS = 30
/** Bus gain crossfades take about this long (seconds), like a film score cut. */
const FADE_TIME = 1.4

/** D4. Every note is expressed as semitones (and optionally octaves) from here. */
const ROOT = 293.665
const f = (semi, oct = 0) => ROOT * Math.pow(2, (semi + 12 * oct) / 12)

// ---------------------------------------------------------------------------
// Tiny synth helpers - each creates its own nodes and stops them after `dur`,
// so nothing needs manual cleanup (stopped nodes are garbage collected).
// ---------------------------------------------------------------------------

/** Attack/decay/sustain/release envelope, returned already wired to `bus`. */
function adsr(ac, bus, at, vol, { attack = 0.01, decay = 0.08, sustain = 0.7, hold = 0.05, release = 0.15 } = {}) {
  const g = ac.createGain()
  const peak = Math.max(0.0001, vol)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(peak, at + attack)
  g.gain.linearRampToValueAtTime(peak * sustain, at + attack + decay)
  g.gain.setValueAtTime(peak * sustain, at + attack + decay + hold)
  g.gain.linearRampToValueAtTime(0.0001, at + attack + decay + hold + release)
  g.connect(bus)
  return { gain: g, end: at + attack + decay + hold + release }
}

/** Total notes scheduled, for the DEV smoke test only (see ensureStarted). */
let noteCount = 0

/** A single melodic voice (used for pad tones, arpeggios, melody, bass, stabs). */
function note(ac, bus, { type = 'triangle', freq, at, vol = 0.1, env, filter, vibrato, detune = 0 }) {
  noteCount += 1
  const osc = ac.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  osc.detune.value = detune
  if (vibrato) {
    const lfo = ac.createOscillator()
    const depth = ac.createGain()
    lfo.frequency.value = vibrato.rate ?? 5.5
    depth.gain.value = vibrato.cents ?? 8
    lfo.connect(depth).connect(osc.detune)
    lfo.start(at)
    lfo.stop(at + (env.hold ?? 0.3) + (env.release ?? 0.3) + 1)
  }
  const { gain, end } = adsr(ac, bus, at, vol, env)
  let node = osc
  if (filter) {
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = filter
    node = node.connect(lp)
  }
  node.connect(gain)
  osc.start(at)
  osc.stop(end + 0.05)
}

/** A soft chord: several detuned voices per tone, for warmth without buzz. */
function padChord(ac, bus, freqs, at, dur, vol) {
  for (const freq of freqs) {
    for (const detune of [-6, 0, 6]) {
      note(ac, bus, {
        type: 'triangle',
        freq,
        at,
        vol: vol / 3,
        detune,
        env: { attack: dur * 0.35, decay: dur * 0.15, sustain: 0.85, hold: dur * 0.35, release: dur * 0.35 },
      })
    }
  }
}

function kick(ac, bus, at, vol = 0.5) {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, at)
  osc.frequency.exponentialRampToValueAtTime(46, at + 0.1)
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.16)
  osc.connect(g).connect(bus)
  osc.start(at)
  osc.stop(at + 0.18)
}

function hat(ac, bus, at, vol = 0.1, open = false) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer()
  const hp = ac.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7500
  const g = ac.createGain()
  const dur = open ? 0.16 : 0.035
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur)
  src.connect(hp).connect(g).connect(bus)
  src.start(at, Math.random() * 0.4)
  src.stop(at + dur + 0.02)
}

function snare(ac, bus, at, vol = 0.22) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer()
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1800
  bp.Q.value = 0.8
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.12)
  src.connect(bp).connect(g).connect(bus)
  src.start(at, Math.random() * 0.4)
  src.stop(at + 0.14)
  const osc = ac.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(190, at)
  const g2 = ac.createGain()
  g2.gain.setValueAtTime(vol * 0.55, at)
  g2.gain.exponentialRampToValueAtTime(0.001, at + 0.09)
  osc.connect(g2).connect(bus)
  osc.start(at)
  osc.stop(at + 0.1)
}

// ---------------------------------------------------------------------------
// Harmony: both themes share the tonic (D), so the mood shift on crossfade
// feels like a change of mode, not a scene cut.
// ---------------------------------------------------------------------------

/**
 * The lobby's 8-bar loop: the J-pop "royal road" progression (IV - V - iii - vi)
 * that so many anime openings are built on, then IV - V - I and a suspended V
 * that pulls straight back round. Four-note voicings, semitones from D4.
 */
const LOBBY_PROGRESSION = [
  [-7, -3, 0, 4], // Gmaj7
  [-5, -1, 2, 5], // A7
  [-8, -5, -1, 2], // F#m7
  [-3, 0, 4, 7], // Bm7
  [-7, -3, 0, 4], // Gmaj7
  [-5, -1, 2, 5], // A7
  [0, 4, 7, 14], // Dmaj9
  [-5, 0, 2, 5], // Asus4
]

/** Each chord's bass note (semitones from D4, before dropping two octaves). */
const LOBBY_BASS = [-7, -5, -8, -3, -7, -5, 0, -5]

/**
 * Melodies as [step within the 8 bars (8 per bar), semitones from D4, length in
 * steps]. The verse climbs hopefully; the chorus reaches higher and lands on a
 * long bright top note.
 */
const VERSE = [
  [2, 9, 1], [3, 7, 1], [4, 9, 2], [6, 12, 2],
  [8, 14, 3], [11, 12, 1], [12, 11, 2], [14, 7, 2],
  [16, 7, 2], [18, 11, 2], [20, 14, 2], [22, 16, 2],
  [24, 16, 4], [28, 14, 2], [30, 12, 2],
  [32, 9, 2], [34, 12, 2], [36, 17, 3], [39, 16, 1],
  [40, 14, 2], [42, 16, 2], [44, 14, 2], [46, 11, 2],
  [48, 12, 4], [52, 7, 2], [54, 4, 2],
  [56, 2, 4],
]
const CHORUS = [
  [0, 12, 1], [1, 14, 1], [2, 16, 2], [4, 16, 2], [6, 19, 2],
  [8, 17, 2], [10, 16, 2], [12, 14, 2], [14, 12, 2],
  [16, 11, 2], [18, 14, 2], [20, 19, 4],
  [24, 21, 4], [28, 19, 2], [30, 16, 2],
  [32, 17, 2], [34, 16, 2], [36, 14, 2], [38, 12, 2],
  [40, 14, 2], [42, 16, 2], [44, 17, 2], [46, 19, 2],
  [48, 19, 6], [54, 16, 2],
  [56, 24, 6],
]

/**
 * The song form, 8 bars each: a gentle intro, a verse with a light beat, the
 * chorus with everything, then a quiet breakdown before it all starts again.
 */
const LOBBY_SECTIONS = ['intro', 'verse', 'chorus', 'breakdown']

/** i - VI - VII - v in D natural minor. */
const BATTLE_CHORDS = [
  [0, 3, 7], // D  F  A
  [-4, 0, 3], // Bb  D  F
  [-2, 2, 5], // C  E  G
  [-5, -2, 2], // A  C  E
]

const BATTLE_PENTA = [0, 3, 5, 7, 10] // D minor pentatonic

/** Two bars (16 steps each) of ostinato riff, degree index into BATTLE_PENTA (null = rest). */
const BATTLE_RIFF = [0, null, 2, 3, null, 2, 0, null, 4, null, 3, 2, null, 3, 5, null]
/** The answering riff, played every other phrase so the loop doesn't wear thin. */
const BATTLE_RIFF_B = [5, null, 4, 3, null, 4, 5, null, 7, null, 6, 5, null, 4, 3, 2]
const BATTLE_KICK = [0, 8]
const BATTLE_SNARE = [4, 12]

/** A soft rising whoosh of noise, for the lift into the chorus. */
function riser(ac, bus, at, dur, vol) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer()
  src.loop = true
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(400, at)
  bp.frequency.exponentialRampToValueAtTime(5000, at + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(vol, at + dur * 0.9)
  g.gain.linearRampToValueAtTime(0.0001, at + dur)
  src.connect(bp).connect(g).connect(bus)
  src.start(at)
  src.stop(at + dur + 0.05)
}

// ---------------------------------------------------------------------------
// Lobby theme: 96 BPM, 8th-note steps, 8-bar sections, a 32-bar song (~80 s).
// ---------------------------------------------------------------------------

class LobbyTrack {
  constructor(ac, bus) {
    this.bus = bus
    this.bpm = 96
    this.stepDur = 60 / this.bpm / 2 // 8th note
    this.barSteps = 8
    this.sectionSteps = this.barSteps * LOBBY_PROGRESSION.length
    this.songSteps = this.sectionSteps * LOBBY_SECTIONS.length
    this.step = 0
    this.nextTime = ac.currentTime + 0.1
  }

  tick(ac) {
    if (ac.currentTime - this.nextTime > 1) this.nextTime = ac.currentTime + 0.05
    while (this.nextTime < ac.currentTime + LOOKAHEAD) {
      this.scheduleStep(ac, this.nextTime)
      this.nextTime += this.stepDur
      this.step += 1
    }
  }

  scheduleStep(ac, at) {
    const bus = this.bus
    const d = this.stepDur
    const song = this.step % this.songSteps
    const section = LOBBY_SECTIONS[Math.floor(song / this.sectionSteps)]
    const s = song % this.sectionSteps
    const bar = Math.floor(s / this.barSteps)
    const inBar = s % this.barSteps
    const chord = LOBBY_PROGRESSION[bar]
    const root = LOBBY_BASS[bar]
    const full = section === 'verse' || section === 'chorus'

    // Pad: a warm held chord every bar, fuller in the chorus.
    if (inBar === 0) {
      padChord(ac, bus, chord.map((semi) => f(semi, 0)), at, d * this.barSteps * 1.1, section === 'chorus' ? 0.2 : 0.14)
    }

    // Electric-piano arpeggio climbing and falling through the chord.
    const order = [0, 1, 2, 3, 2, 1, 2, 3]
    const semi = chord[order[inBar]] + (inBar >= 4 ? 12 : 0)
    note(ac, bus, {
      type: 'sine',
      freq: f(semi, 0),
      at,
      vol: section === 'breakdown' ? 0.035 : 0.05,
      env: { attack: 0.004, decay: 0.15, sustain: 0.25, hold: 0, release: 0.3 },
    })

    // Bass: long notes in the intro and breakdown, a gentle pulse under the song.
    if (!full) {
      if (inBar === 0) {
        note(ac, bus, {
          type: 'triangle',
          freq: f(root, -2),
          at,
          vol: 0.14,
          env: { attack: 0.02, decay: 0.3, sustain: 0.6, hold: d * 5, release: d * 2 },
        })
      }
    } else if ([0, 3, 4, 6].includes(inBar)) {
      note(ac, bus, {
        type: 'triangle',
        freq: f(root + (inBar === 6 ? 7 : 0), -2),
        at,
        vol: 0.15,
        env: { attack: 0.01, decay: 0.12, sustain: 0.5, hold: d * 0.6, release: 0.15 },
      })
    }

    // Drums: a soft, steady beat in the verse, a fuller one in the chorus.
    if (full) {
      if (inBar === 0 || inBar === 4 || (section === 'chorus' && inBar === 5)) kick(ac, bus, at, 0.22)
      if (inBar === 2 || inBar === 6) snare(ac, bus, at, section === 'chorus' ? 0.09 : 0.06)
      hat(ac, bus, at, inBar % 2 ? 0.02 : 0.035)
    }

    // Melody: the verse line, then the chorus hook doubled by bells an octave up.
    const line = section === 'verse' ? VERSE : section === 'chorus' ? CHORUS : null
    const hit = line?.find((n) => n[0] === s)
    if (hit) {
      const [, pitch, len] = hit
      note(ac, bus, {
        type: 'square',
        freq: f(pitch, 0),
        at,
        vol: section === 'chorus' ? 0.06 : 0.05,
        filter: 2200,
        vibrato: { rate: 5.5, cents: 9 },
        env: { attack: 0.02, decay: 0.1, sustain: 0.7, hold: d * len * 0.6, release: d * 0.8 },
      })
      if (section === 'chorus') {
        note(ac, bus, {
          type: 'sine',
          freq: f(pitch, 1),
          at,
          vol: 0.035,
          env: { attack: 0.004, decay: 0.25, sustain: 0.3, hold: d * len * 0.3, release: 0.6 },
        })
      }
    }

    // Intro and breakdown: a music-box sparkle running up the chord each bar.
    if (!full && inBar % 2 === 0 && bar % 2 === 1) {
      note(ac, bus, {
        type: 'sine',
        freq: f(chord[(inBar / 2) % chord.length] + 24, 0),
        at,
        vol: 0.03,
        env: { attack: 0.003, decay: 0.3, sustain: 0.2, hold: 0, release: 0.8 },
      })
    }

    // The lift into the chorus: a riser and a snare roll over the verse's last bar.
    if (section === 'verse' && s === this.sectionSteps - this.barSteps) riser(ac, bus, at, d * this.barSteps, 0.05)
    if (section === 'verse' && bar === 7 && inBar >= 4) {
      snare(ac, bus, at, 0.05 + (inBar - 4) * 0.015)
      snare(ac, bus, at + d / 2, 0.05 + (inBar - 4) * 0.015)
    }
    // A crash of bells where the chorus lands.
    if (section === 'chorus' && s === 0) {
      for (const semi2 of [12, 16, 19, 24]) {
        note(ac, bus, { type: 'sine', freq: f(semi2, 1), at, vol: 0.025, env: { attack: 0.003, decay: 0.4, sustain: 0.3, hold: 0.2, release: 1.2 } })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Battle theme: 150 BPM, 16th-note steps, one chord per bar, 4-bar phrase.
// A fixed pentatonic riff rides on top of the moving chord roots (an ostinato),
// which is what gives it that driving, epic quality rather than needing a
// second melody per chord.
// ---------------------------------------------------------------------------

class BattleTrack {
  constructor(ac, bus) {
    this.bus = bus
    this.bpm = 150
    this.stepDur = 60 / this.bpm / 4 // 16th note
    this.barSteps = 16
    this.phraseSteps = this.barSteps * BATTLE_CHORDS.length
    this.step = 0
    this.nextTime = ac.currentTime + 0.1
  }

  tick(ac) {
    if (ac.currentTime - this.nextTime > 1) this.nextTime = ac.currentTime + 0.05
    while (this.nextTime < ac.currentTime + LOOKAHEAD) {
      this.scheduleStep(ac, this.nextTime)
      this.nextTime += this.stepDur
      this.step += 1
    }
  }

  scheduleStep(ac, at) {
    const s = this.step % this.phraseSteps
    const bar = Math.floor(s / this.barSteps)
    const inBar = s % this.barSteps
    const chord = BATTLE_CHORDS[bar]
    // How urgent things are right now (0 calm .. 1 wave-is-right-behind-you).
    const tension = runtime.dead ? 0 : useGame.getState().danger ? 1 : 0

    // Bass: driving 8th notes, root/fifth alternating.
    if (inBar % 2 === 0) {
      const up = (inBar / 2) % 2 === 1
      note(ac, this.bus, {
        type: 'sawtooth',
        freq: f(chord[0] + (up ? 7 : 0), -1),
        at,
        vol: 0.16 + tension * 0.05,
        filter: 900,
        env: { attack: 0.004, decay: 0.05, sustain: 0.4, hold: 0, release: 0.1 },
      })
    }

    // Chord stabs on the off-beats.
    if (inBar % 4 === 2) {
      for (const semi of chord) {
        note(ac, this.bus, {
          type: 'square',
          freq: f(semi, 0),
          at,
          vol: 0.055,
          filter: 2400,
          env: { attack: 0.003, decay: 0.06, sustain: 0.2, hold: 0, release: 0.08 },
        })
      }
    }

    // Ostinato riff, independent of the chord underneath.
    const riff = Math.floor(this.step / this.phraseSteps) % 2 ? BATTLE_RIFF_B : BATTLE_RIFF
    const deg = riff[s % riff.length]
    if (deg !== null) {
      note(ac, this.bus, {
        type: 'square',
        freq: f(BATTLE_PENTA[deg % BATTLE_PENTA.length], 1 + Math.floor(deg / BATTLE_PENTA.length)),
        at,
        vol: 0.1 + tension * 0.04,
        filter: 3200,
        vibrato: tension > 0.5 ? { rate: 7, cents: 10 } : undefined,
        env: { attack: 0.004, decay: 0.08, sustain: 0.35, hold: 0, release: 0.09 },
      })
    }

    // Drums.
    if (BATTLE_KICK.includes(inBar)) kick(ac, this.bus, at, 0.4)
    if (BATTLE_SNARE.includes(inBar)) snare(ac, this.bus, at, 0.18)
    hat(ac, this.bus, at, inBar % 4 === 0 ? 0.09 : 0.05, false)

    // Tension accent: an urgent high ping on every beat while something's chasing you.
    if (tension > 0.5 && inBar % 4 === 0) {
      note(ac, this.bus, {
        type: 'triangle',
        freq: f(BATTLE_PENTA[4] + 12, 1),
        at,
        vol: 0.09,
        env: { attack: 0.002, decay: 0.05, sustain: 0.5, hold: 0.03, release: 0.2 },
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Director: owns both tracks' buses, crossfades between them by reading
// runtime.stage, and starts everything on the first user interaction.
// ---------------------------------------------------------------------------

let started = false
let lobbyBus = null
let battleBus = null
let musicMaster = null
let lobbyTrack = null
let battleTrack = null
let inStage = false
let switchedAt = -1e9

function ensureStarted() {
  const ac = audio()
  if (!ac || started) return
  started = true

  musicMaster = ac.createGain()
  musicMaster.gain.value = 1
  musicMaster.connect(destination())
  const applyMusic = () => {
    const on = !isMuted() && useGame.getState().music
    musicMaster.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05)
  }
  onMuteChange(applyMusic)
  useGame.subscribe((s, prev) => {
    if (s.music !== prev.music) applyMusic()
  })
  applyMusic()

  const vol = ac.createGain()
  vol.gain.value = MUSIC_VOLUME
  vol.connect(musicMaster)

  lobbyBus = ac.createGain()
  lobbyBus.gain.value = 1
  lobbyBus.connect(vol)

  battleBus = ac.createGain()
  battleBus.gain.value = 0
  battleBus.connect(vol)

  lobbyTrack = new LobbyTrack(ac, lobbyBus)
  battleTrack = new BattleTrack(ac, battleBus)

  setInterval(() => {
    const now = audio()
    if (!now) return
    // Crossfade toward whichever theme fits where the player actually is.
    const nowInStage = (runtime.stage > 0 || !!runtime.trial) && !runtime.dead
    // Only the audible track schedules notes (each note is a handful of audio
    // nodes); the other keeps playing just long enough to fade out.
    if (nowInStage !== inStage) switchedAt = performance.now()
    const fading = performance.now() - switchedAt < 3500
    if (nowInStage || fading) battleTrack.tick(now)
    if (!nowInStage || fading) lobbyTrack.tick(now)
    if (nowInStage !== inStage) {
      inStage = nowInStage
      lobbyBus.gain.setTargetAtTime(inStage ? 0 : 1, now.currentTime, FADE_TIME / 3)
      battleBus.gain.setTargetAtTime(inStage ? 1 : 0, now.currentTime, FADE_TIME / 3)
    }
  }, TICK_MS)

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__saeMusic = {
      ctx: ac,
      lobbyBus,
      battleBus,
      get inStage() {
        return inStage
      },
      get notes() {
        return noteCount
      },
    }
  }
}

if (typeof window !== 'undefined') {
  const start = () => ensureStarted()
  window.addEventListener('pointerdown', start, { passive: true })
  window.addEventListener('keydown', start)
}

export default ensureStarted
