import { create } from 'zustand'

import {
  ANIMES,
  AVATAR_ID,
  BOOTS,
  bootsById,
  giftWins,
  MAX_LEVEL,
  potionById,
  premiumPadCost,
  rebirthSpeedMult,
  rebirthWinsMult,
  stageWins,
  stepGain,
  todayKey,
  TREADMILLS,
  TWO_X_WINS_REQUIREMENT,
  WALK_UNIT,
  walkDisplay,
  walkMs,
  xpNeed,
} from './config'
import { runtime } from './runtime'

/**
 * The game's UI-facing state and every rule that changes it.
 *
 * There is no server: progress is saved to localStorage under the signed-in
 * Bloxity user's id (or the guest id), so each player on a device keeps their
 * own save. `SAVED_KEYS` is exactly what gets written.
 */

const SAVE_VERSION = 1
const SAVE_PREFIX = 'w2sae:save:'

const SAVED_KEYS = [
  'wins',
  'speed',
  'xp',
  'level',
  'rebirths',
  'ownedAnimes',
  'equipped',
  'ownedBoots',
  'boots',
  'ownedTreadmills',
  'ownedPads',
  'potion',
  'bestStage',
  'giftDay',
  'adjust',
  'music',
  'sound',
  'stats',
  'trials',
]

function freshSave() {
  return {
    wins: 0,
    speed: 0,
    xp: 0,
    level: 1,
    rebirths: 0,
    ownedAnimes: [AVATAR_ID],
    equipped: AVATAR_ID,
    ownedBoots: [],
    boots: null,
    ownedTreadmills: ['t1'],
    ownedPads: [],
    potion: null,
    bestStage: 0,
    /** Local date (YYYY-MM-DD) the daily gift was last claimed. */
    giftDay: '',
    adjust: null,
    music: true,
    sound: true,
    stats: { winsEarned: 0, deaths: 0, claims: 0, steps: 0 },
    trials: {},
  }
}

let toastId = 0

export const useGame = create((set, get) => ({
  ...freshSave(),

  /** localStorage key of the save in use, null until an identity is known. */
  saveKey: null,
  loaded: false,

  // --- Transient UI state -----------------------------------------------------
  /** 'shop' | 'backpack' | 'rebirth' | 'teleport' | 'controls' | null */
  modal: null,
  shopTab: 'animes',
  /** Anime picked in the shop preview. */
  shopPick: null,
  toasts: [],
  /** Big centre banner: { title, sub, color, key }. */
  banner: null,
  /** "Level up!" popup: { level, from, to, key }. */
  levelUp: null,
  /** "[E] ..." prompt near a pad: { text, cost?, color? }. */
  prompt: null,
  /** Stage the world is built around (mounted region). 0 = lobby. */
  zone: 0,
  /** Speed trial HUD: { name, level, progress, lead, need } or null. */
  trialHud: null,
  dead: false,
  /** Seconds left on the death screen. */
  respawnIn: 0,
  /** Something is chasing the player (music tension). */
  danger: false,

  // --- Save / load --------------------------------------------------------------
  loadFor(identityId) {
    const key = SAVE_PREFIX + (identityId || 'local')
    if (get().saveKey === key) return
    let data = freshSave()
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.v === SAVE_VERSION) data = { ...data, ...parsed.data }
      }
    } catch {
      // Corrupt or blocked storage: start fresh.
    }
    data.level = Math.min(MAX_LEVEL, Math.max(1, data.level | 0))
    if (!data.ownedAnimes.includes(AVATAR_ID)) data.ownedAnimes.unshift(AVATAR_ID)
    if (!data.ownedAnimes.includes(data.equipped)) data.equipped = AVATAR_ID
    if (!data.ownedTreadmills.includes('t1')) data.ownedTreadmills.unshift('t1')
    set({ ...data, saveKey: key, loaded: true })
  },

  save() {
    const state = get()
    if (!state.saveKey) return
    const data = {}
    for (const k of SAVED_KEYS) data[k] = state[k]
    try {
      localStorage.setItem(state.saveKey, JSON.stringify({ v: SAVE_VERSION, data }))
    } catch {
      // Storage full / private mode: keep playing unsaved.
    }
  },

  // --- UI helpers ----------------------------------------------------------------
  openModal(modal, extra = {}) {
    set({ modal, ...extra })
  },
  closeModal() {
    set({ modal: null })
  },
  toast(text, { color = '#ffffff', icon = '', ms = 2600 } = {}) {
    toastId += 1
    const id = toastId
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, color, icon }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },
  showBanner(title, sub, color = '#ffd23f') {
    set({ banner: { title, sub, color, key: performance.now() } })
  },
  setPrompt(prompt) {
    const cur = get().prompt
    if (cur?.text === prompt?.text && cur?.cost === prompt?.cost) return
    set({ prompt })
  },

  // --- Speed and levels ---------------------------------------------------------
  /**
   * One step's worth of Speed. `mult` is the treadmill's multiplier (1 running).
   * Returns the Speed gained (for the "+N" popups).
   */
  stepSpeed(mult = 1) {
    const s = get()
    const boots = bootsById(s.boots)
    const potion = s.potion && s.potion.until > Date.now() ? s.potion.mult : 1
    const gain = Math.max(1, Math.round((stepGain(s.level) + (boots?.bonus || 0)) * mult * rebirthSpeedMult(s.rebirths) * potion))
    let { level, xp } = s
    const from = level
    if (level < MAX_LEVEL) {
      xp += gain
      while (level < MAX_LEVEL && xp >= xpNeed(level)) {
        xp -= xpNeed(level)
        level += 1
      }
      if (level >= MAX_LEVEL) xp = 0
    }
    const patch = { speed: s.speed + gain, xp, level, stats: { ...s.stats, steps: s.stats.steps + 1 } }
    if (level !== from) {
      patch.levelUp = { level, from: walkDisplay(from), to: walkDisplay(level), key: performance.now() }
      // A custom (slower) walk speed is reset so the new speed is felt at once.
      patch.adjust = null
      runtime.levelUps += 1
    }
    set(patch)
    return gain
  },

  /** Current walk speed in m/s (the level's max unless adjusted lower). */
  walkSpeed() {
    const s = get()
    const max = walkDisplay(s.level)
    const shown = s.adjust ? Math.min(max, s.adjust) : max
    return shown === max ? walkMs(s.level) : shown * WALK_UNIT
  },
  setAdjust(value) {
    const max = walkDisplay(get().level)
    const v = Math.round(value)
    set({ adjust: v >= max ? null : Math.max(8, v) })
  },

  // --- Wins -----------------------------------------------------------------------
  /** Win pad at the end of stage n. Returns the Wins paid, or 0 if refused. */
  claimWins(n, double = false) {
    const s = get()
    if (double && s.wins < TWO_X_WINS_REQUIREMENT) return 0
    const amount = Math.round(stageWins(n) * (double ? 2 : 1) * rebirthWinsMult(s.rebirths))
    set({
      wins: s.wins + amount,
      bestStage: Math.max(s.bestStage, n),
      stats: { ...s.stats, winsEarned: s.stats.winsEarned + amount, claims: s.stats.claims + 1 },
    })
    return amount
  },
  noteStageReached(n) {
    if (n > get().bestStage) set({ bestStage: n })
  },

  /** Spend Wins; false (and nothing spent) when short. */
  spend(cost) {
    const s = get()
    if (s.wins < cost) {
      get().toast(`Not enough Wins! Need ${Math.ceil(cost - s.wins).toLocaleString('en-US')} more`, { color: '#ff6a6a', icon: '🏆' })
      return false
    }
    set({ wins: s.wins - cost })
    return true
  },

  // --- Shop ------------------------------------------------------------------------
  buyAnime(id) {
    const s = get()
    if (s.ownedAnimes.includes(id)) return get().equipAnime(id)
    const anime = ANIMES.find((a) => a.id === id)
    if (!anime || !get().spend(anime.cost)) return false
    set((st) => ({ ownedAnimes: [...st.ownedAnimes, id], equipped: id }))
    get().toast(`${anime.name} unlocked!`, { color: anime.aura?.color || '#fff', icon: anime.icon })
    return true
  },
  equipAnime(id) {
    if (!get().ownedAnimes.includes(id)) return false
    set({ equipped: id })
    return true
  },
  buyBoots(id) {
    const s = get()
    if (s.ownedBoots.includes(id)) {
      set({ boots: s.boots === id ? null : id })
      return true
    }
    const boots = bootsById(id)
    if (!boots || !get().spend(boots.cost)) return false
    set((st) => ({ ownedBoots: [...st.ownedBoots, id], boots: id }))
    get().toast(`${boots.name} equipped! +${boots.bonus} Speed per step`, { color: boots.glow, icon: '👟' })
    return true
  },
  buyTreadmill(id) {
    const t = TREADMILLS.find((x) => x.id === id)
    if (!t || get().ownedTreadmills.includes(id)) return true
    if (!get().spend(t.cost)) return false
    set((st) => ({ ownedTreadmills: [...st.ownedTreadmills, id] }))
    get().toast(`x${t.mult} Treadmill unlocked!`, { color: t.color, icon: '🏃' })
    return true
  },
  buyPad(n) {
    if (get().ownedPads.includes(n)) return true
    if (!get().spend(premiumPadCost(n))) return false
    set((st) => ({ ownedPads: [...st.ownedPads, n] }))
    get().toast(`Stage ${n} training pad unlocked!`, { color: '#ffd23f', icon: '⚡' })
    return true
  },
  buyPotion(id) {
    const p = potionById(id)
    if (!p || !get().spend(p.cost)) return false
    const s = get()
    const now = Date.now()
    // Same strength stacks its time; a stronger one replaces a weaker one.
    const cur = s.potion && s.potion.until > now ? s.potion : null
    const until = cur && cur.mult === p.mult ? cur.until + p.seconds * 1000 : now + p.seconds * 1000
    const mult = cur && cur.mult > p.mult ? cur.mult : p.mult
    set({ potion: { mult, until: cur && cur.mult > p.mult ? cur.until : until } })
    get().toast(`${p.name} active!`, { color: p.color, icon: p.icon })
    return true
  },

  // --- Rebirth -----------------------------------------------------------------------
  canRebirth() {
    return get().level >= MAX_LEVEL
  },
  rebirth() {
    if (!get().canRebirth()) return false
    set((s) => ({ rebirths: s.rebirths + 1, level: 1, xp: 0, speed: 0, adjust: null }))
    return true
  },

  // --- Daily gift --------------------------------------------------------------------------
  giftReady() {
    return get().giftDay !== todayKey()
  },
  claimGift() {
    const s = get()
    if (!s.giftReady()) return 0
    const amount = Math.round(giftWins(s.bestStage) * rebirthWinsMult(s.rebirths))
    set({ wins: s.wins + amount, giftDay: todayKey() })
    return amount
  },

  // --- Trials ----------------------------------------------------------------------------
  noteTrial(key) {
    set((s) => ({ trials: { ...s.trials, [key]: (s.trials[key] || 0) + 1 } }))
  },

  // --- Settings ----------------------------------------------------------------------------
  setMusic(music) {
    set({ music })
  },
  setSound(sound) {
    set({ sound })
  },

  // --- Dev tools ------------------------------------------------------------------------------
  devSetLevel(level) {
    const l = Math.min(MAX_LEVEL, Math.max(1, level))
    set({ level: l, xp: 0, adjust: null })
  },
  devAddWins(amount) {
    set((s) => ({ wins: s.wins + amount }))
  },
}))

/** Total Speed added per step right now, before treadmills (for the HUD). */
export function selectStepPreview(s) {
  const boots = bootsById(s.boots)
  const potion = s.potion && s.potion.until > Date.now() ? s.potion.mult : 1
  return Math.max(1, Math.round((stepGain(s.level) + (boots?.bonus || 0)) * rebirthSpeedMult(s.rebirths) * potion))
}

export const allBoots = BOOTS
