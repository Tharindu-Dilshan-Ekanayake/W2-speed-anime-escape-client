import { create } from 'zustand'

/**
 * Start-up progress for the loading screen. Each real milestone lifts the bar
 * to at least its percentage; the screen glides smoothly in between.
 */
export const BOOT_STEPS = {
  start: 6,
  /** Fredoka is ready (every sign and label is drawn with it). */
  fonts: 35,
  /** Physics is up and the lobby, the player and the camera are mounted. */
  world: 60,
  /** The player's own character (their Bloxity avatar, or an anime) is ready. */
  avatar: 85,
  /** A handful of frames have actually been drawn with it: the game is on screen. */
  frames: 100,
}

export const useBoot = create(() => ({ target: BOOT_STEPS.start, label: 'Signing in to Bloxity…' }))

/** Records a milestone (never moves the bar backwards). */
export function bootStep(step, label) {
  const target = BOOT_STEPS[step]
  useBoot.setState((s) => (target > s.target ? { target, label } : {}))
}
