import { Vector3 } from 'three'

/**
 * Mutable per-frame game state that must NOT go through React.
 *
 * The physics loop writes here 60x a second (player position, what the player is
 * standing on) and map pieces register their trigger volumes and moving hazards
 * here. UI-facing state lives in the zustand store (store.js) instead.
 */
export const runtime = {
  /** Capsule centre, updated every physics frame. */
  playerPos: new Vector3(0, 1.4, 36),
  /** Feet height of the floor last stood on. */
  groundY: 0,
  /** Which stage the player is physically in (0 = lobby). */
  stage: 0,

  /** Trigger / kill volumes registered by map pieces (see zones.js). */
  zones: new Set(),
  /** Moving hazards: functions (px, feetY, pz) => true when they hit the player. */
  hazards: new Set(),
  /** Moving platforms: { x, y, z, half: [x, z], vx, vz } kept current by each mover. */
  movers: new Set(),

  /** Treadmill / training pad currently stood on, or null. { mult, owned, id } */
  treadmill: null,

  /** Where the player respawns. */
  checkpoint: { position: [0, 1.4, 36], yaw: 0 },

  dead: false,
  deathPos: new Vector3(),
  deathCause: '',

  /** A pending teleport, consumed by the Player on its next frame. */
  teleport: null,
  /** Until this time (ms) the player is being blown about (a tornado hit) and can't steer. */
  stunUntil: 0,
  /** The velocity of that blow (m/s), x and z. */
  blow: { x: 0, z: 0 },
  /** The Player holds still (no gravity) until this time (ms) after a teleport. */
  freezeUntil: 0,
  /** A pending camera yaw snap, consumed by the FollowCamera. */
  cameraYaw: null,

  /** Touch input, written by TouchControls. */
  touchMove: { x: 0, y: 0 },
  touchJump: false,
  orbitDelta: { x: 0, y: 0 },
  /** Camera turn from the A / D keys: -1 (left) .. 1 (right). */
  turnInput: 0,
  /** Camera turn from the on-screen buttons: -1 / 0 / 1. */
  buttonTurn: 0,

  /** Horizontal speed (m/s) and footing, for the effects. */
  moveSpeed: 0,
  grounded: true,
  /** Which way the model faces (radians about Y). */
  playerYaw: 0,
  /** The equipped anime's model (its joints), for the afterimages. */
  playerModel: null,
  /** Scene clock, seconds. */
  time: 0,

  /** Counters bumped on events; effects watch them for changes. */
  jumps: 0,
  doubleJumps: 0,
  lands: 0,
  teleports: 0,
  levelUps: 0,
  steps: 0,
  /** Win pad / trial cleared (confetti). */
  celebrations: 0,
  /** Night theme active (set by the Environment). */
  night: false,
  /** The air particles' material (set by the Environment). */
  airMaterial: null,
  /** Footprints waiting to be stamped: { x, y, z, yaw, side }. */
  footprints: [],
  /** Level-up bursts waiting to play: { x, y, z, color } (the player's and other players'). */
  bursts: [],
  /** "+5" floating numbers waiting to be shown: { value, x, y, z }. */
  floaters: [],

  /** The action behind the "[E]" prompt currently shown, if any. */
  promptAction: null,

  /** The speed trial in progress, or null. Owned by world/Trial.jsx. */
  trial: null,
}

/** Queue a teleport; the Player applies it on its next physics frame. */
export function teleportTo({ position, yaw = 0 }) {
  runtime.teleport = { position: [...position], yaw }
}
