import {
  STAGE_COUNT,
  STAGES,
  stageLevel,
  TRIAL_HEAD_START,
  trialChaserSpeed,
  walkMs,
} from './config'

/**
 * The map's geometry, computed once from config - no React, so the player,
 * teleports and the HUD can all ask "where is stage 7?" without the stage being
 * mounted.
 *
 * Everything runs along -Z. The lobby sits around the origin; stage 1 begins at
 * STAGE_START_Z and each stage follows straight on from the last. Inside a stage
 * every segment has a world-space start `z0` and end `z1` (z1 < z0). The walking
 * surface is at y = 0 unless a segment says otherwise.
 *
 * Segment sizes scale with the stage's walk speed `v` (its level's max), so a
 * gap that needs a running jump at level 3 still needs one at level 15.
 */

export const LOBBY = { maxZ: 80, minZ: -14, halfW: 40 }
export const SPAWN = { position: [0, 1.4, 36], yaw: 0 }
export const STAGE_START_Z = LOBBY.minZ

const START_LEN = 16
const FINISH_LEN = 66
/** Extra width on each side of the path at a stage's end plaza, for the pads. */
export const PLAZA_SIDE = 22
/** Where the stage 1 gate stands in the lobby. */
export const LOBBY_GATE_Z = STAGE_START_Z + 4

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

/** Deterministic PRNG, so a stage is laid out the same on every load. */
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export const stageWidth = (n) => 22 + n * 0.5

/** Builds one segment's measurements. `z0` is where it starts (its +Z edge). */
function buildSegment(kind, arg, ctx) {
  const { v, W, s, n, random } = ctx
  const count = Number(arg) || 1
  switch (kind) {
    case 'start':
      return { len: START_LEN, spawnZ: -8 }
    case 'zigzag': {
      // Platforms stepping left and right over the fluid.
      const gap = clamp(0.35 * v, 2.5, 10)
      const plat = clamp(0.6 * v, 7, 18)
      const width = W * 0.55
      const platforms = []
      let z = -gap
      for (let i = 0; i < count; i += 1) {
        platforms.push({ z, len: plat, width, x: (i % 2 ? 1 : -1) * W * 0.22 })
        z -= plat + gap
      }
      return { len: -z, platforms }
    }
    case 'climb': {
      // Up a long ramp, along a high narrow bridge, and back down.
      const rise = 7 + Math.min(6, n * 0.3)
      const up = 26 * s
      const top = 32 * s
      const down = 26 * s
      return { len: up + top + down, rise, up, top, down, bridgeW: Math.max(5, W * 0.42) }
    }
    case 'run':
      return { len: Math.round(count * s) }
    case 'gaps': {
      const gap = clamp(0.45 * v, 3, 13)
      const plat = clamp(0.55 * v, 6, 16)
      const platforms = []
      let z = -gap
      for (let i = 0; i < count; i += 1) {
        const width = W * (0.45 + random() * 0.4)
        const x = (random() - 0.5) * (W - width) * 0.8
        platforms.push({ z, len: plat, width, x })
        z -= plat + gap
      }
      return { len: -z, gap, plat, platforms }
    }
    case 'stones': {
      const size = clamp(3 + v * 0.08, 3.5, 6)
      const rowGap = clamp(0.32 * v, 2.5, 9)
      const stones = []
      let z = -rowGap
      for (let r = 0; r < count; r += 1) {
        const per = 2 + Math.floor(random() * 2)
        for (let i = 0; i < per; i += 1) {
          const x = ((i + 0.5) / per - 0.5) * W * 0.75 + (random() - 0.5) * 3
          stones.push({ x, z: z - size / 2, size, h: 0.4 + random() * 0.6 })
        }
        z -= size + rowGap
      }
      return { len: -z, stones }
    }
    case 'spinners': {
      const platLen = Math.max(24, v * 1.1)
      const gap = clamp(0.3 * v, 2.5, 8)
      const plats = []
      let z = -gap
      for (let i = 0; i < count; i += 1) {
        plats.push({ z: z - platLen / 2, len: platLen, omega: (1.3 + n * 0.04) * (i % 2 ? -1 : 1), phase: random() * 6 })
        z -= platLen + gap
      }
      return { len: -z, plats, gap }
    }
    case 'movers': {
      const size = clamp(6 + v * 0.1, 7, 10)
      const gap = clamp(0.38 * v, 3, 11)
      const movers = []
      let z = -gap
      for (let i = 0; i < count; i += 1) {
        movers.push({ z: z - size / 2, size, amp: W * 0.3, period: Math.max(2.2, 3.4 - n * 0.05), phase: i * 1.7 + random() })
        z -= size + gap
      }
      return { len: -z, movers, size }
    }
    case 'boulders': {
      const rampLen = 42 * s
      const rise = 6
      const top = 16 * s
      const down = 18
      return { len: rampLen + top + down, rampLen, rise, top, down, every: Math.max(0.55, 1.4 - n * 0.04), speed: 10 + v * 0.45 }
    }
    case 'lasers': {
      const spacing = clamp(0.9 * v, 8, 24)
      const gates = []
      for (let i = 0; i < count; i += 1) {
        gates.push({ z: -8 - i * spacing, period: 2.4, on: 0.45, phase: random(), low: random() < 0.35 })
      }
      return { len: count * spacing + 10, gates }
    }
    case 'crushers': {
      const spacing = clamp(0.8 * v, 8, 22)
      const rows = []
      for (let i = 0; i < count; i += 1) rows.push({ z: -6 - i * spacing, phase: random(), period: Math.max(1.4, 2.2 - n * 0.03) })
      return { len: count * spacing + 8, rows }
    }
    case 'narrow': {
      const legLen = 18 * s
      const pad = 5
      const legs = []
      let z = -4
      for (let i = 0; i < count; i += 1) {
        const x = (i % 2 ? 1 : -1) * W * 0.22
        legs.push({ z, len: legLen, x, width: clamp(2.6 - n * 0.03, 1.8, 2.6) })
        z -= legLen + pad
      }
      return { len: -z + 2, legs, pad }
    }
    case 'pillars': {
      const gap = clamp(0.32 * v, 2.5, 9)
      const size = 6
      const step = 1.5
      const pillars = []
      let z = -gap
      for (let i = 0; i < count; i += 1) {
        pillars.push({ z: z - size / 2, size, top: step * (i + 1), x: (random() - 0.5) * W * 0.4 })
        z -= size + gap
      }
      const peak = step * count
      // A long ramp back down to the path.
      const rampLen = Math.max(18, peak * 3.2)
      return { len: -z + rampLen, pillars, peak, rampLen, rampZ: z }
    }
    case 'finish':
      // A wide plaza: win pads and training pads either side of the path, in
      // front of the wall holding the next stage's gate.
      return { len: FINISH_LEN, gateZ: -(FINISH_LEN - 4), padZ: -(FINISH_LEN - 13), plazaW: W + PLAZA_SIDE * 2, last: n === STAGE_COUNT }
    default: {
      if (kind.startsWith('trial')) return null
      return { len: 20 }
    }
  }
}

function buildTrial(chaser, ctx) {
  const { v, n } = ctx
  const startPad = 14
  const endPad = 16
  const length = clamp(9 * v, 110, 260)
  return {
    chaser,
    len: startPad + length + endPad,
    startPad,
    endPad,
    length,
    level: stageLevel(n),
    speed: trialChaserSpeed(stageLevel(n)),
    headStart: TRIAL_HEAD_START,
  }
}

function buildStage(n, z0) {
  const v = walkMs(stageLevel(n))
  const W = stageWidth(n)
  const s = 0.6 + 0.4 * (v / 7)
  const random = rng(n * 977 + 13)
  const ctx = { v, W, s, n, random }
  const segs = []
  let z = z0
  const add = (kind, data) => {
    segs.push({ kind, ...data, z0: z, z1: z - data.len, index: segs.length })
    z -= data.len
  }
  add('start', buildSegment('start', 0, ctx))
  STAGES[n - 1].segments.forEach((spec) => {
    const [kind, arg] = spec.split(':')
    if (kind === 'trial') add('trial', buildTrial(arg, ctx))
    else add(kind, buildSegment(kind, arg, ctx))
  })
  add('finish', buildSegment('finish', 0, ctx))

  return { n, v, W, z0, z1: z, len: z0 - z, segs, spawnZ: z0 + segs[0].spawnZ, meta: STAGES[n - 1] }
}

/** Every stage, index 0 = stage 1. */
export const STAGE_LAYOUT = (() => {
  const out = []
  let z = STAGE_START_Z
  for (let n = 1; n <= STAGE_COUNT; n += 1) {
    const stage = buildStage(n, z)
    out.push(stage)
    z = stage.z1
  }
  return out
})()

export const stageLayout = (n) => STAGE_LAYOUT[n - 1] || null
export const WORLD_END_Z = STAGE_LAYOUT[STAGE_LAYOUT.length - 1].z1

/** Which stage a world z falls in (0 = the lobby). */
export function stageAtZ(z) {
  if (z > STAGE_START_Z) return 0
  for (const stage of STAGE_LAYOUT) if (z > stage.z1) return stage.n
  return STAGE_COUNT
}

/** Where a teleport to stage `n` lands (just past its gate). 0 = lobby spawn. */
export function stageSpawn(n) {
  if (n <= 0) return SPAWN
  return { position: [0, 1.4, stageLayout(n).spawnZ], yaw: 0 }
}

/** How far through stage `n` a world z is, 0..1. */
export function stageProgress(n, z) {
  const stage = stageLayout(n)
  if (!stage) return 0
  return clamp((stage.z0 - z) / stage.len, 0, 1)
}
