import { useEffect } from 'react'

import { runtime } from './runtime'

/**
 * Trigger volumes, checked against the player every physics frame.
 *
 * A zone is either an axis-aligned box `{ min: [x,y,z], max: [x,y,z] }` or a
 * vertical cylinder `{ center: [x,y,z], radius, height }`, plus any of:
 *   kill: true            - touching it kills the player
 *   damage: n             - touching it takes n health (see damagePlayer)
 *   onEnter() / onExit()  - fired on the frame the player enters / leaves
 *   prompt() -> string    - while inside, show "[E] <text>"; `action()` runs on E
 *
 * The player is tested as a vertical segment from the feet to the head, padded
 * sideways by its radius, so standing on a pad's top face counts as touching it.
 */

const PLAYER_RADIUS = 0.3
const PLAYER_HEIGHT = 1.8

function overlaps(zone, px, feetY, pz) {
  const headY = feetY + PLAYER_HEIGHT
  if (zone.min) {
    return (
      px > zone.min[0] - PLAYER_RADIUS &&
      px < zone.max[0] + PLAYER_RADIUS &&
      pz > zone.min[2] - PLAYER_RADIUS &&
      pz < zone.max[2] + PLAYER_RADIUS &&
      headY > zone.min[1] &&
      feetY < zone.max[1]
    )
  }
  const [cx, cy, cz] = zone.center
  const dx = px - cx
  const dz = pz - cz
  const r = zone.radius + PLAYER_RADIUS
  return dx * dx + dz * dz < r * r && headY > cy && feetY < cy + zone.height
}

/**
 * Runs every frame from the Player. Reports whether something lethal was hit, the
 * biggest damage taken this frame, and the prompt of the first promptable zone
 * the player is inside.
 *
 * Moving hazards return `true` (lethal), a number (damage) or a falsy value.
 */
export function updateZones(px, feetY, pz) {
  let killed = false
  let damage = 0
  let prompt = null
  let blow = null

  for (const zone of runtime.zones) {
    const inside = overlaps(zone, px, feetY, pz)
    if (inside && zone.kill) killed = true
    if (inside && zone.damage) damage = Math.max(damage, zone.damage)
    if (inside && !zone.inside) {
      zone.inside = true
      zone.onEnter?.()
    } else if (!inside && zone.inside) {
      zone.inside = false
      zone.onExit?.()
    }
    if (inside && zone.prompt && !prompt) {
      const p = zone.prompt()
      if (p) prompt = typeof p === 'string' ? { text: p, action: zone.action } : { action: zone.action, ...p }
    }
    if (inside && zone.onStay) zone.onStay()
  }

  for (const hazard of runtime.hazards) {
    const hit = hazard(px, feetY, pz)
    if (hit === true) killed = true
    else if (hit > 0) damage = Math.max(damage, hit)
    else if (hit && typeof hit === 'object') blow = hit
  }

  return { killed, damage, prompt, blow }
}

/** Forget "inside" state, so re-entering after a teleport fires onEnter again. */
export function resetZones() {
  for (const zone of runtime.zones) {
    if (zone.inside) {
      zone.inside = false
      zone.onExit?.()
    }
  }
}

/** Registers a zone for the lifetime of the calling component. */
export function useZone(factory, deps) {
  useEffect(() => {
    const zone = factory()
    if (!zone) return undefined
    runtime.zones.add(zone)
    return () => {
      if (zone.inside) zone.onExit?.()
      runtime.zones.delete(zone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Registers a moving-hazard hit test for the lifetime of the calling component. */
export function useHazard(test) {
  useEffect(() => {
    runtime.hazards.add(test)
    return () => runtime.hazards.delete(test)
  }, [test])
}
