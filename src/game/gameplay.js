import { STAGES, stageLevel, teleportCost, TWO_X_WINS_REQUIREMENT } from './config'
import { abbreviate } from './format'
import { SPAWN, STAGE_LAYOUT, stageSpawn } from './layout'
import { runtime, teleportTo } from './runtime'
import { sfx } from './sfx'
import { useGame } from './store'
import { resetZones } from './zones'

/**
 * Game-flow actions shared by the world, the player and the HUD: dying,
 * respawning, checkpoints and teleports between stages.
 */

const RESPAWN_SECONDS = 1.6
/** The player floats in place this long after a teleport so the destination's colliders can mount. */
const FREEZE_MS = 500

let respawnTimer = null

/** Moves the player (and the mounted part of the world) somewhere. */
function moveTo(spot, zone) {
  useGame.setState({ zone })
  runtime.stage = zone
  runtime.freezeUntil = performance.now() + FREEZE_MS
  teleportTo(spot)
  resetZones()
}

export function setCheckpoint(position, yaw = 0) {
  runtime.checkpoint = { position: [...position], yaw }
}

/** Something killed the player. `cause`: 'fall' | 'fluid' | 'hazard' | 'trial'. */
export function killPlayer(cause = 'hazard', message) {
  if (runtime.dead) return
  runtime.dead = true
  runtime.deathCause = cause
  runtime.deathPos.copy(runtime.playerPos)
  const game = useGame.getState()
  useGame.setState({ dead: true, respawnIn: RESPAWN_SECONDS, danger: false, stats: { ...game.stats, deaths: game.stats.deaths + 1 } })
  if (cause === 'fluid' || cause === 'fall') sfx.splash()
  else sfx.death()
  if (message) game.toast(message, { color: '#ff6a6a', icon: '💀', ms: 3200 })
  clearTimeout(respawnTimer)
  respawnTimer = setTimeout(respawn, RESPAWN_SECONDS * 1000)
}

/** After a death the player always starts again from the lobby. */
export function respawn() {
  clearTimeout(respawnTimer)
  runtime.dead = false
  runtime.trial = null
  setCheckpoint(SPAWN.position, SPAWN.yaw)
  moveTo(SPAWN, 0)
  useGame.setState({ dead: false, respawnIn: 0, trialHud: null, danger: false })
  sfx.teleport()
}

/**
 * Teleport to the start of stage `n` (0 = the lobby). Unless `force` (dev tools,
 * respawns, win pads) it needs the stage's level and costs Wins - going home is free.
 */
export function teleportToStage(n, { force = false } = {}) {
  const game = useGame.getState()
  if (!force && n > 0) {
    if (game.level < stageLevel(n)) {
      game.toast(`Stage ${n} needs Level ${stageLevel(n)}!`, { color: '#ff6a6a', icon: '🔒' })
      sfx.deny()
      return false
    }
    if (!game.spend(teleportCost(n))) {
      sfx.deny()
      return false
    }
  }
  clearTimeout(respawnTimer)
  runtime.dead = false
  runtime.trial = null
  useGame.setState({ dead: false, respawnIn: 0, trialHud: null, danger: false, modal: null })
  const spot = n > 0 ? stageSpawn(n) : SPAWN
  setCheckpoint(spot.position, spot.yaw)
  moveTo(spot, n)
  sfx.teleport()
  if (n > 0) game.showBanner(`STAGE ${n}`, `${STAGES[n - 1].name} · ${STAGES[n - 1].jp}`)
  return true
}

export function teleportHome() {
  return teleportToStage(0, { force: true })
}

let claiming = false

/**
 * A win pad at the end of stage `n` was touched: pay out, celebrate, and send
 * the player home to spend it (the Teleport menu brings them straight back).
 */
export function claimStageWins(n, double = false) {
  if (claiming || runtime.dead) return
  const game = useGame.getState()
  if (double && game.wins < TWO_X_WINS_REQUIREMENT) {
    game.toast(`The 2x pad needs ${abbreviate(TWO_X_WINS_REQUIREMENT)} Wins owned (you have ${abbreviate(game.wins)})`, { color: '#ff8a8a', icon: '🔒', ms: 3200 })
    sfx.deny()
    return
  }
  const amount = game.claimWins(n, double)
  if (!amount) return
  claiming = true
  runtime.celebrations += 1
  sfx.coins(8)
  sfx.win()
  game.showBanner(`+${abbreviate(amount)} WINS!`, `Stage ${n} cleared${double ? ' · 2X' : ''}`, double ? '#39e05a' : '#ffd23f')
  setTimeout(() => {
    claiming = false
    teleportHome()
  }, 1400)
}

// Dev-server handle for poking at the game from the browser console.
if ((import.meta.env?.DEV || import.meta.env?.VITE_EXPOSE === '1') && typeof window !== 'undefined') {
  window.__w2 = { runtime, useGame, teleportToStage, layout: STAGE_LAYOUT }
}
