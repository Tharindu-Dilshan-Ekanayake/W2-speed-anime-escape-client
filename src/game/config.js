/**
 * Every tunable number in the game lives here: levels, walk speed, the economy
 * (everything is bought with Wins - there are no Bux purchases), the 20 stages,
 * the anime characters, boots, treadmills and potions.
 *
 * Core loop:
 *   run -> every step adds Speed (+1 per step at level 1 ... +8 at level 20, plus
 *   boots) -> Speed gained fills the level bar -> each level raises the max walk
 *   speed -> faster runners clear later stages and their speed trials -> stage end
 *   win pads pay Wins -> Wins buy animes, boots, treadmills and potions.
 *   At level 20 the bar is full and a Rebirth is needed (level and Speed reset,
 *   Speed gained afterwards is multiplied).
 */

// ---------------------------------------------------------------------------
// Levels and walk speed
// ---------------------------------------------------------------------------

export const MAX_LEVEL = 20

/** The walk speed shown at level 1 and at the level cap. */
export const WALK_MIN_DISPLAY = 20
export const WALK_MAX_DISPLAY = 56

/**
 * Max walk speed (m/s) at a level: 20 on the speed readout at level 1, rising
 * smoothly (about 5.6% a level) to 56 at level 20. The gap between two
 * neighbouring levels is what lets a speed trial tell them apart (see
 * TRIAL_SPEED_RATIO).
 */
export const walkMs = (level) => {
  const l = Math.max(1, Math.min(MAX_LEVEL, level))
  return 7 * Math.pow(WALK_MAX_DISPLAY / WALK_MIN_DISPLAY, (l - 1) / (MAX_LEVEL - 1))
}

/** The walk speed number the HUD shows ("Adjust Speed 43"). 1 unit = 0.35 m/s. */
export const WALK_UNIT = 0.35
export const walkDisplay = (level) => Math.round(walkMs(level) / WALK_UNIT)

/** Speed (XP) needed to go from `level` to `level + 1`. */
export const xpNeed = (level) => Math.round(40 * Math.pow(1.3, level - 1))

/** Speed gained per step: +1 at level 1 rising to +8 at level 20 (before boots). */
export const stepGain = (level) => Math.round(1 + (7 * (Math.max(1, level) - 1)) / (MAX_LEVEL - 1))

/** A "step" (Speed tick) happens this often while running or on a treadmill. */
export const STEP_SECONDS = 0.4

/** Rebirth bonuses. */
export const rebirthSpeedMult = (rebirths) => 1 + 0.5 * rebirths
export const rebirthWinsMult = (rebirths) => 1 + 0.25 * rebirths

// ---------------------------------------------------------------------------
// Physics feel
// ---------------------------------------------------------------------------

export const GRAVITY = -32
export const JUMP_HEIGHT = 2.4
export const DOUBLE_JUMP_HEIGHT = 2.2
export const jumpVelocity = (height) => Math.sqrt(2 * -GRAVITY * height)
/** The floor of every stage hangs over lava / sea at this height. Below = dead. */
export const FLUID_Y = -5
export const KILL_Y = -4

// ---------------------------------------------------------------------------
// Speed trials: a hazard (lava flood, tsunami, collapsing bridge...) chases the
// runner. It moves just slower than the trial level's max walk speed, so a
// player at that level outruns it and anyone a level lower is caught.
// ---------------------------------------------------------------------------

/** The chaser is 2% slower than the stage level's top speed; one level lower is ~3.5% slower than the chaser. */
export const TRIAL_SPEED_RATIO = 1.02
export const TRIAL_HEAD_START = 3
export const trialChaserSpeed = (level) => walkMs(level) / TRIAL_SPEED_RATIO

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

/** Wins paid by stage N's yellow win pad. The green pad pays double. */
export const stageWins = (n) => Math.round(2 * Math.pow(1.65, n - 1))

/** The green 2x win pad only works once the player owns this many Wins. */
export const TWO_X_WINS_REQUIREMENT = 350000

/** Teleporting to a stage costs this multiple of what its win pad pays (the lobby is free). */
export const TELEPORT_FEE = 1.5
export const teleportCost = (n) => (n <= 0 ? 0 : Math.max(1, Math.ceil(stageWins(n) * TELEPORT_FEE)))

/** The pay-once training pad at the end of each stage. */
export const premiumPadMult = (n) => Math.round(2 + n * 1.5)
export const premiumPadCost = (n) => Math.max(5, Math.round(stageWins(n) * 3))

/** The daily gift: once per calendar day (local time). */
export const giftWins = (bestStage) => Math.max(25, Math.round(stageWins(Math.max(1, bestStage)) * 2.5))
/** Today's date as YYYY-MM-DD, local time. */
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Seconds until local midnight (when the next daily gift unlocks). */
export function secondsToMidnight(now = new Date()) {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return Math.max(0, Math.ceil((next - now) / 1000))
}

/** Lobby treadmills (training). Standing on one gains Speed without moving. */
export const TREADMILLS = [
  { id: 't1', mult: 1, cost: 0, color: '#4fb8ff', accent: '#bfe8ff', fx: 'sparkle' },
  { id: 't2', mult: 2, cost: 25, color: '#39d353', accent: '#a8ff8a', fx: 'sparkle' },
  { id: 't5', mult: 5, cost: 300, color: '#ffc21f', accent: '#fff07a', fx: 'fire' },
  { id: 't10', mult: 10, cost: 3000, color: '#ff4fd8', accent: '#ffb3f2', fx: 'electric' },
  { id: 't25', mult: 25, cost: 30000, color: '#8a4bff', accent: '#d3b8ff', fx: 'aura' },
  { id: 't50', mult: 50, cost: 150000, color: '#ff3b3b', accent: '#ffb03b', fx: 'fire' },
  { id: 't100', mult: 100, cost: 500000, color: '#ffffff', accent: '#ffffff', fx: 'rainbow', rainbow: true },
]
export const treadmillById = (id) => TREADMILLS.find((t) => t.id === id) || null

/** Boots: bought with Wins, each adds flat Speed to every step. */
export const BOOTS = [
  { id: 'swift', name: 'Swift Sneakers', bonus: 1, cost: 15, color: '#f4f6ff', glow: '#5fc8ff' },
  { id: 'turbo', name: 'Turbo Kicks', bonus: 2, cost: 60, color: '#ff3b4a', glow: '#ffd23f' },
  { id: 'spring', name: 'Spring Jumpers', bonus: 3, cost: 250, color: '#39d353', glow: '#b8ff6a' },
  { id: 'flame', name: 'Flame Striders', bonus: 4, cost: 1000, color: '#ff7a1f', glow: '#ffcf2e' },
  { id: 'thunder', name: 'Thunder Treads', bonus: 5, cost: 4000, color: '#ffe23a', glow: '#fffbd0' },
  { id: 'aqua', name: 'Aqua Dashers', bonus: 6, cost: 12000, color: '#1fb8ff', glow: '#9ae8ff' },
  { id: 'shadow', name: 'Shadow Steps', bonus: 8, cost: 40000, color: '#2a1a4a', glow: '#a46bff' },
  { id: 'galaxy', name: 'Galaxy Boots', bonus: 10, cost: 120000, color: '#3a1aa8', glow: '#ff6af0' },
  { id: 'divine', name: 'Divine Wings', bonus: 15, cost: 350000, color: '#fff6d8', glow: '#ffd700' },
]
export const bootsById = (id) => BOOTS.find((b) => b.id === id) || null

/** Potions: timed Speed multipliers, bought with Wins. */
export const POTIONS = [
  { id: 'p2', name: '2x Speed Potion', mult: 2, seconds: 300, cost: 40, color: '#39d353', icon: '🧪' },
  { id: 'p3', name: '3x Speed Potion', mult: 3, seconds: 300, cost: 1500, color: '#1fb8ff', icon: '⚗️' },
  { id: 'p5', name: '5x Speed Potion', mult: 5, seconds: 300, cost: 40000, color: '#ff4fd8', icon: '💖' },
]
export const potionById = (id) => POTIONS.find((p) => p.id === id) || null

// ---------------------------------------------------------------------------
// Characters. Everyone starts as their own Bloxity avatar. Animes are bought
// with Wins and are looks only - every character runs at the same speed (the
// level decides that). What an anime gives is its aura, glow, running effect
// and the glowing footprints it leaves on the path.
//
// `fx`   - the running particle effect (see fx/RunFx.jsx KINDS)
// `aura` - colours of the glow shell / ground ring; `tier` 1..5 grows the aura
// `print`- footprint shape + colour (see fx/Footprints.jsx)
// `look` - the blocky R6 model (see animeModel.js)
// ---------------------------------------------------------------------------

const SKIN = '#f3d2b8'

export const AVATAR_ID = 'avatar'
export const AVATAR = {
  id: AVATAR_ID,
  name: 'Your Avatar',
  title: 'Bloxity Runner',
  cost: 0,
  avatar: true,
  icon: '🧑',
  fx: { kind: 'dust', colors: ['#ffffff', '#9fd8ff'] },
  print: { shape: 'shoe', color: '#bfe8ff' },
  aura: null,
}

export const ANIMES = [
  {
    id: 'kaze',
    name: 'Kaze',
    title: 'Wind Ninja',
    cost: 10,
    icon: '🍃',
    fx: { kind: 'wind', colors: ['#d8fff0', '#7dffc4', '#2fe89a'] },
    aura: { color: '#5dffb0', color2: '#d8fff0', tier: 1 },
    print: { shape: 'shoe', color: '#6dffc0' },
    look: {
      run: 'ninja',
      skin: SKIN,
      face: { eyes: '#1fbf7a', grin: true },
      hair: { style: 'naruto', color: '#3ddc84', color2: '#1fa86a' },
      headband: '#1e3a5f',
      shirt: { color: '#2fbf71', pattern: 'shoulders', color2: '#173b2a' },
      sleeves: { color: '#2fbf71' },
      pants: { color: '#1a5e3a' },
      scarf: '#e8fff2',
      shoes: '#173b2a',
    },
  },
  {
    id: 'hoshi',
    name: 'Hoshi',
    title: 'Star Idol',
    cost: 30,
    icon: '⭐',
    fx: { kind: 'stars', colors: ['#fff36a', '#ff7ad1', '#ffffff'] },
    aura: { color: '#ff8ad8', color2: '#fff36a', tier: 1 },
    print: { shape: 'star', color: '#ffd23f' },
    look: {
      run: 'cool',
      skin: '#f6d7c3',
      face: { eyes: '#ff4fa8', blush: true, grin: true },
      hair: { style: 'long', color: '#ff7ac8', color2: '#ffd23f' },
      shirt: { color: '#ff9ad5', pattern: 'shoulders', color2: '#ffffff' },
      sleeves: { color: '#ffffff' },
      pants: { color: '#ff5fb8' },
      trim: '#ffd23f',
      belt: '#ffd23f',
      shoes: '#ffffff',
    },
  },
  {
    id: 'raijin',
    name: 'Raijin',
    title: 'Thunder Knight',
    cost: 75,
    icon: '⚡',
    fx: { kind: 'thunder', colors: ['#ffe23a', '#fffbe0', '#ffa21f'] },
    aura: { color: '#ffe23a', color2: '#fff7b0', tier: 2 },
    print: { shape: 'bolt', color: '#ffe23a' },
    look: {
      run: 'ninja',
      skin: SKIN,
      face: { eyes: '#f0b01e', angry: true },
      hair: { style: 'up', color: '#ffe23a', color2: '#ff9d00' },
      shirt: { color: '#1c1c24', pattern: 'triangles', color2: '#ffe23a' },
      sleeves: { color: '#1c1c24' },
      pants: { color: '#1c1c24' },
      coat: { color: '#1c1c24', pattern: 'triangles', color2: '#ffe23a' },
      sword: { blade: '#ffe23a', glow: '#ffc800', guard: '#ffffff' },
      trim: '#ffe23a',
      shoes: '#ffe23a',
    },
  },
  {
    id: 'yuki',
    name: 'Yuki',
    title: 'Frost Princess',
    cost: 150,
    icon: '❄️',
    fx: { kind: 'frost', colors: ['#e8fbff', '#7fd8ff', '#3aa8ff'] },
    aura: { color: '#8fe6ff', color2: '#ffffff', tier: 2 },
    print: { shape: 'flake', color: '#9ae8ff' },
    look: {
      run: 'cool',
      skin: '#f8e2d6',
      face: { eyes: '#4fc8ff', blush: true },
      hair: { style: 'long', color: '#e8f8ff', color2: '#7fd8ff' },
      shirt: { color: '#dff6ff' },
      haori: { color: '#bfeaff', pattern: 'checker', color2: '#ffffff' },
      coat: { color: '#bfeaff', pattern: 'checker', color2: '#ffffff' },
      pants: { color: '#5fb8ff' },
      trim: '#7fd8ff',
      shoes: '#ffffff',
    },
  },
  {
    id: 'enma',
    name: 'Enma',
    title: 'Flame Fist',
    cost: 300,
    icon: '🔥',
    fx: { kind: 'flame', colors: ['#ff5a1f', '#ffd21f', '#ffae3a'] },
    aura: { color: '#ff6a1f', color2: '#ffd21f', tier: 2 },
    print: { shape: 'flame', color: '#ff7a1f' },
    look: {
      run: 'brawler',
      skin: '#f1c6a0',
      face: { eyes: '#ff6a1e', grin: true, angry: true },
      hair: { style: 'flame', color: '#ff3b1f', color2: '#ffd21f', glow: true },
      shirt: { color: '#1a1a1a', pattern: 'flames', color2: '#ff4a1f' },
      sleeves: { color: '#1a1a1a' },
      pants: { color: '#2a1410' },
      gloves: '#ff5a1f',
      wristbands: '#ffd21f',
      belt: '#ff5a1f',
      shoes: '#ff5a1f',
    },
  },
  {
    id: 'sakuya',
    name: 'Sakuya',
    title: 'Blossom Blade',
    cost: 600,
    icon: '🌸',
    fx: { kind: 'sakura', colors: ['#ffb7d5', '#ff6aa8', '#fff0f6'] },
    aura: { color: '#ff9ac8', color2: '#fff0f6', tier: 2 },
    print: { shape: 'flower', color: '#ff8fc0' },
    look: {
      run: 'cool',
      skin: '#f6d7c3',
      face: { eyes: '#e0407a', blush: true },
      hair: { style: 'ponytail', color: '#ffb7d5' },
      shirt: { color: '#2a1a24' },
      haori: { color: '#fff0f6', pattern: 'butterfly', color2: '#ff7ab0' },
      coat: { color: '#fff0f6', pattern: 'butterfly', color2: '#ff7ab0' },
      pants: { color: '#2a1a24' },
      sword: { blade: '#ffb7d5', glow: '#ff6aa8', guard: '#ffffff' },
      belt: '#ff7ab0',
      shoes: '#ffffff',
    },
  },
  {
    id: 'kage',
    name: 'Kage',
    title: 'Shadow Ronin',
    cost: 1200,
    icon: '🌑',
    fx: { kind: 'shadow', colors: ['#1a0f2e', '#a46bff'] },
    aura: { color: '#8a4bff', color2: '#2a1050', tier: 3 },
    print: { shape: 'shoe', color: '#a46bff' },
    look: {
      run: 'ninja',
      skin: '#e9d6c8',
      face: { eyes: '#b77cff', angry: true },
      hair: { style: 'messy', color: '#18142a', color2: '#6a3aff' },
      mask: '#18142a',
      shirt: { color: '#15122a', pattern: 'speckle', color2: '#9a6bff' },
      pants: { color: '#15122a' },
      coat: { color: '#0e0a1c', pattern: 'speckle', color2: '#9a6bff' },
      sword: { blade: '#6a3aff', glow: '#6a3aff', guard: '#1a1a1a' },
      trim: '#8a4bff',
      shoes: '#0e0e14',
    },
  },
  {
    id: 'umi',
    name: 'Umi',
    title: 'Tide Monk',
    cost: 2500,
    icon: '🌊',
    fx: { kind: 'water', colors: ['#3ab8ff', '#9ae8ff', '#ffffff'] },
    aura: { color: '#3ab8ff', color2: '#c8f4ff', tier: 3 },
    print: { shape: 'drop', color: '#5ad0ff' },
    look: {
      skin: '#f1c6a0',
      face: { eyes: '#1f7ae0' },
      hair: { style: 'short', color: '#1a4a8a', color2: '#0a2a5a' },
      shirt: { color: '#0a3a6a' },
      haori: { color: '#1fa3ff', pattern: 'checker', color2: '#0a3a6a' },
      coat: { color: '#1fa3ff', pattern: 'checker', color2: '#0a3a6a' },
      pants: { color: '#0a3a6a' },
      belt: '#9ae8ff',
      wristbands: '#9ae8ff',
      shoes: '#eeeeee',
    },
  },
  {
    id: 'doku',
    name: 'Doku',
    title: 'Toxic Dragon',
    cost: 5000,
    icon: '🐉',
    fx: { kind: 'toxic', colors: ['#9dff2a', '#2fbf1f', '#e8ffb0'] },
    aura: { color: '#8dff2a', color2: '#1f6a10', tier: 3 },
    print: { shape: 'paw', color: '#9dff2a' },
    look: {
      run: 'brawler',
      skin: '#e8d0b0',
      face: { eyes: '#9dff2a', angry: true, grin: true },
      hair: { style: 'up', color: '#9dff2a', color2: '#2a8a10', glow: true },
      horns: '#1a2a10',
      shirt: { color: '#1a2a10', pattern: 'speckle', color2: '#9dff2a' },
      sleeves: { color: '#1a2a10' },
      pants: { color: '#1a2a10' },
      cape: { color: '#2a8a10' },
      trim: '#9dff2a',
      shoes: '#9dff2a',
    },
  },
  {
    id: 'neko',
    name: 'Neko',
    title: 'Cyber Kitsune',
    cost: 9000,
    icon: '🦊',
    fx: { kind: 'electric', colors: ['#4ff0ff', '#ff4ff0', '#ffffff'] },
    aura: { color: '#4ff0ff', color2: '#ff4ff0', tier: 3 },
    print: { shape: 'paw', color: '#ff4ff0' },
    look: {
      run: 'ninja',
      skin: '#f6d7c3',
      face: { eyes: '#4ff0ff', grin: true },
      hair: { style: 'swept', color: '#ff4ff0', color2: '#4ff0ff' },
      horns: '#ff4ff0',
      goggles: '#4ff0ff',
      shirt: { color: '#10142a', pattern: 'hero', color2: '#ff4ff0', color3: '#4ff0ff' },
      sleeves: { color: '#ff4ff0' },
      pants: { color: '#10142a' },
      gloves: '#4ff0ff',
      trim: '#4ff0ff',
      shoes: '#4ff0ff',
    },
  },
  {
    id: 'luna',
    name: 'Luna',
    title: 'Moon Witch',
    cost: 15000,
    icon: '🌙',
    fx: { kind: 'moon', colors: ['#d8c8ff', '#7a5cff', '#fff6c2'] },
    aura: { color: '#b49cff', color2: '#fff6c2', tier: 4 },
    print: { shape: 'moon', color: '#d8c8ff' },
    ghost: '#9a7cff',
    look: {
      run: 'cool',
      skin: '#f8e2d6',
      face: { eyes: '#a35fe6', blush: true },
      hair: { style: 'long', color: '#d8c8ff', color2: '#7a5cff' },
      shirt: { color: '#2a1a5a', pattern: 'speckle', color2: '#fff6c2' },
      pants: { color: '#2a1a5a' },
      cape: { color: '#4a2aa8', pattern: 'speckle', color2: '#fff6c2' },
      collar: '#fff6c2',
      trim: '#fff6c2',
      shoes: '#2a1a5a',
    },
  },
  {
    id: 'sol',
    name: 'Sol',
    title: 'Golden Sage',
    cost: 25000,
    icon: '☀️',
    fx: { kind: 'aura', colors: ['#ffd21f', '#fff3a0', '#5ae8ff'] },
    aura: { color: '#ffd21f', color2: '#fff3a0', tier: 4 },
    print: { shape: 'star', color: '#ffd21f' },
    ghost: '#ffd21f',
    look: {
      skin: '#f1c6a0',
      face: { eyes: '#1fb3a8', angry: true },
      hair: { style: 'up', color: '#ffe23a', color2: '#ffb800', size: 1.35, glow: true },
      shirt: { color: '#ff8a1f', pattern: 'shoulders', color2: '#2a4ab8' },
      sleeves: { color: '#2a4ab8' },
      gloves: '#ffffff',
      wristbands: '#2a4ab8',
      pants: { color: '#ff8a1f' },
      belt: '#2a4ab8',
      shoes: '#2a4ab8',
    },
  },
  {
    id: 'cho',
    name: 'Cho',
    title: 'Butterfly Spirit',
    cost: 40000,
    icon: '🦋',
    fx: { kind: 'butterfly', colors: ['#c47bff', '#7ad8ff', '#ffb8f0'] },
    aura: { color: '#c47bff', color2: '#7ad8ff', tier: 4 },
    print: { shape: 'flower', color: '#c47bff' },
    ghost: '#c47bff',
    look: {
      run: 'cool',
      sword: { blade: '#c9a8ff', glow: '#9a5cff', guard: '#ffffff' },
      skin: '#f6d7c3',
      face: { eyes: '#a35fe6', blush: true },
      hair: { style: 'long', color: '#1a1426', color2: '#8a4fd0' },
      shirt: { color: '#16161c' },
      haori: { color: '#f4eefc', pattern: 'butterfly', color2: '#8a4fd0' },
      coat: { color: '#f4eefc', pattern: 'butterfly', color2: '#8a4fd0' },
      pants: { color: '#16161c' },
      shoes: '#eeeeee',
    },
  },
  {
    id: 'karasu',
    name: 'Karasu',
    title: 'Crimson Crow',
    cost: 65000,
    icon: '🐦‍⬛',
    fx: { kind: 'crow', colors: ['#0c0c12', '#ff1f2a', '#6a0a14'] },
    aura: { color: '#ff1f2a', color2: '#2a0508', tier: 4 },
    print: { shape: 'shoe', color: '#ff2a3a' },
    ghost: '#ff1f2a',
    look: {
      run: 'ninja',
      skin: '#f1d9c4',
      face: { eyes: '#e0101a', angry: true },
      hair: { style: 'ponytail', color: '#15151b' },
      headband: '#2b2b33',
      collar: '#15151b',
      shirt: { color: '#15151b', pattern: 'clouds' },
      sleeves: { color: '#15151b', pattern: 'clouds' },
      coat: { color: '#15151b', pattern: 'clouds' },
      pants: { color: '#15151b' },
      shoes: '#4a4a55',
    },
  },
  {
    id: 'oni',
    name: 'Oni',
    title: 'Void Monarch',
    cost: 100000,
    icon: '👹',
    fx: { kind: 'monarch', colors: ['#1a0a2e', '#9a5cff', '#d8b8ff'] },
    aura: { color: '#7a3aff', color2: '#ff3a8a', tier: 5 },
    print: { shape: 'flame', color: '#9a5cff' },
    ghost: '#8a4bff',
    look: {
      run: 'brawler',
      skin: '#e0ccd8',
      face: { eyes: '#ff3a8a', angry: true, grin: true },
      hair: { style: 'messy', color: '#12101e', color2: '#7a3aff', size: 1.1 },
      horns: '#1a1a1a',
      shirt: { color: '#15122a', pattern: 'speckle', color2: '#9a6bff' },
      pants: { color: '#15122a' },
      cape: { color: '#2a0a4a', pattern: 'speckle', color2: '#ff3a8a' },
      trim: '#8a4bff',
      wristbands: '#ff3a8a',
      shoes: '#0e0e14',
    },
  },
  {
    id: 'niji',
    name: 'Niji',
    title: 'Rainbow Hero',
    cost: 160000,
    icon: '🌈',
    fx: { kind: 'rainbow', colors: ['#ff3b3b', '#ffa21f', '#ffe23a', '#39d353', '#1fb8ff', '#8a4bff', '#ff4fd8'] },
    aura: { color: '#ffffff', color2: '#ff4fd8', tier: 5, rainbow: true },
    print: { shape: 'heart', color: '#ff4fd8', rainbow: true },
    ghost: '#ffffff',
    look: {
      skin: '#f1c6a0',
      face: { eyes: '#1fb8ff', grin: true },
      hair: { style: 'swept', color: '#ff4fd8', color2: '#ffe23a' },
      shirt: { color: '#ffffff', pattern: 'hero', color2: '#ff3b3b', color3: '#1fb8ff' },
      sleeves: { color: '#ffe23a' },
      pants: { color: '#1fb8ff' },
      cape: { color: '#ff3b3b' },
      gloves: '#39d353',
      trim: '#ff4fd8',
      belt: '#ffa21f',
      shoes: '#8a4bff',
    },
  },
  {
    id: 'sora',
    name: 'Sora',
    title: 'Galaxy Emperor',
    cost: 250000,
    icon: '🌌',
    fx: { kind: 'galaxy', colors: ['#6a00ff', '#ff00d4', '#00e5ff', '#ffffff'] },
    aura: { color: '#6a3aff', color2: '#00e5ff', tier: 5 },
    print: { shape: 'star', color: '#9a6bff', rainbow: false },
    ghost: '#6a3aff',
    look: {
      run: 'cool',
      skin: '#e9d6c8',
      face: { eyes: '#00e5ff' },
      hair: { style: 'swept', color: '#1a0a4a', color2: '#ff00d4', glow: true },
      shirt: { color: '#0a0624', pattern: 'speckle', color2: '#ffffff' },
      pants: { color: '#0a0624', pattern: 'speckle', color2: '#ffffff' },
      cape: { color: '#2a0a6a', pattern: 'speckle', color2: '#00e5ff' },
      collar: '#00e5ff',
      trim: '#ff00d4',
      shoes: '#00e5ff',
    },
  },
  {
    id: 'ryujin',
    name: 'Ryujin',
    title: 'Celestial Dragon God',
    cost: 400000,
    icon: '🐲',
    fx: { kind: 'divine', colors: ['#ffd700', '#ff3a1f', '#ffffff'] },
    aura: { color: '#ffd700', color2: '#ff3a1f', tier: 5 },
    print: { shape: 'flame', color: '#ffd700' },
    ghost: '#ffd700',
    look: {
      run: 'brawler',
      skin: '#f5e0d0',
      face: { eyes: '#ffd700', angry: true, grin: true },
      hair: { style: 'flame', color: '#fff6d8', color2: '#ffd700', glow: true },
      horns: '#ffd700',
      shirt: { color: '#f5f5f5', pattern: 'flames', color2: '#ff3a1f' },
      pants: { color: '#f5f5f5' },
      cape: { color: '#c8101a' },
      belt: '#ffd700',
      wristbands: '#ffd700',
      trim: '#ffd700',
      sword: { blade: '#ffd700', glow: '#ffb000', guard: '#ff3a1f' },
      shoes: '#ffd700',
    },
  },
]

export const ALL_CHARACTERS = [AVATAR, ...ANIMES]
export const characterById = (id) => ALL_CHARACTERS.find((c) => c.id === id) || AVATAR

// ---------------------------------------------------------------------------
// Stages. Stage N needs level N to enter (its gate is shut below that), and its
// speed trials need level N too. Everything is laid out along -Z (see layout.js).
//
// Segment kinds (see world/Stage.jsx):
//   run, gaps, stones, spinners, movers, boulders, lasers, crushers, narrow,
//   pillars, trial:<chaser>
// Trial chasers: bridge, lava, wave, avalanche, sandstorm, storm, laserwall,
//   shadow, acid
// ---------------------------------------------------------------------------

export const STAGES = [
  { name: 'SAKURA VILLAGE', jp: '桜の村', theme: 'sakura', segments: ['run:40', 'gaps:3', 'climb', 'stones:4', 'trial:bridge', 'run:16'] },
  { name: 'BAMBOO GROVE', jp: '竹林', theme: 'bamboo', segments: ['run:30', 'zigzag:4', 'spinners:2', 'narrow:2', 'trial:wave'] },
  { name: 'DESERT RUINS', jp: '砂漠の遺跡', theme: 'desert', segments: ['run:24', 'boulders:1', 'climb', 'gaps:4', 'trial:sandstorm'] },
  { name: 'PIRATE COVE', jp: '海賊の入江', theme: 'pirate', segments: ['movers:4', 'zigzag:4', 'stones:5', 'crushers:3', 'trial:wave'] },
  { name: 'VOLCANO ESCAPE', jp: '火山脱出', theme: 'volcano', segments: ['gaps:5', 'lasers:4', 'pillars:5', 'trial:lava', 'run:16'] },
  { name: 'FROZEN PEAKS', jp: '氷の峰', theme: 'ice', segments: ['run:24', 'climb', 'boulders:1', 'narrow:3', 'spinners:2', 'trial:avalanche'] },
  { name: 'NINJA ROOFTOPS', jp: '忍の屋根', theme: 'ninja', segments: ['zigzag:5', 'spinners:2', 'movers:4', 'climb', 'trial:bridge'] },
  { name: 'CRYSTAL CAVES', jp: '水晶の洞窟', theme: 'crystal', segments: ['lasers:5', 'stones:5', 'pillars:5', 'zigzag:4', 'trial:shadow'] },
  { name: 'THUNDER PLAINS', jp: '雷の平原', theme: 'storm', segments: ['run:24', 'lasers:5', 'movers:5', 'climb', 'gaps:4', 'trial:storm'] },
  { name: 'TOXIC SWAMP', jp: '毒の沼', theme: 'swamp', segments: ['stones:5', 'zigzag:5', 'spinners:3', 'gaps:5', 'trial:acid'] },
  { name: 'SKY TEMPLE', jp: '天空の神殿', theme: 'sky', segments: ['movers:5', 'climb', 'narrow:3', 'pillars:6', 'crushers:3', 'trial:bridge'] },
  { name: 'SHADOW REALM', jp: '影の世界', theme: 'shadow', segments: ['crushers:4', 'zigzag:5', 'lasers:5', 'gaps:5', 'trial:shadow'] },
  { name: 'NEON CITY', jp: 'ネオン街', theme: 'neon', segments: ['lasers:6', 'climb', 'movers:5', 'spinners:3', 'stones:5', 'trial:laserwall'] },
  { name: 'DRAGON MOUNTAINS', jp: '竜の山', theme: 'dragon', segments: ['boulders:1', 'gaps:6', 'climb', 'crushers:4', 'pillars:6', 'trial:lava'] },
  { name: 'CORAL OCEAN', jp: '珊瑚の海', theme: 'coral', segments: ['stones:6', 'zigzag:6', 'movers:5', 'narrow:3', 'spinners:3', 'trial:wave'] },
  { name: 'CANDY KINGDOM', jp: 'お菓子の国', theme: 'candy', segments: ['spinners:3', 'climb', 'boulders:1', 'gaps:6', 'movers:5', 'trial:bridge'] },
  { name: 'GHOST SHRINE', jp: '幽霊神社', theme: 'ghost', segments: ['lasers:6', 'zigzag:6', 'crushers:4', 'narrow:4', 'stones:6', 'trial:shadow'] },
  { name: 'GALAXY ROAD', jp: '銀河の道', theme: 'galaxy', segments: ['movers:6', 'climb', 'stones:6', 'pillars:6', 'spinners:3', 'trial:laserwall'] },
  { name: 'GOLDEN HEAVEN', jp: '黄金の天国', theme: 'heaven', segments: ['gaps:6', 'climb', 'boulders:1', 'lasers:6', 'trial:storm', 'zigzag:6', 'trial:bridge'] },
  { name: "DEMON KING'S CASTLE", jp: '魔王城', theme: 'castle', segments: ['crushers:5', 'lasers:6', 'climb', 'spinners:4', 'gaps:6', 'trial:lava', 'zigzag:6', 'movers:6', 'trial:shadow'] },
]

export const STAGE_COUNT = STAGES.length
/** Stage N needs this level to enter. */
export const stageLevel = (n) => Math.max(1, n)

/** Names shown on the trial arches. */
export const TRIAL_NAMES = {
  bridge: 'COLLAPSING BRIDGE',
  lava: 'LAVA FLOOD',
  wave: 'TSUNAMI',
  avalanche: 'AVALANCHE',
  sandstorm: 'SANDSTORM',
  storm: 'THUNDERSTORM',
  laserwall: 'LASER WALL',
  shadow: 'SHADOW SWARM',
  acid: 'ACID FLOOD',
}
