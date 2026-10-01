import { Callbacks, Client } from '@colyseus/sdk'
import { create } from 'zustand'

import { useBloxityStore } from '../bloxity/store'
import { runtime } from './runtime'
import { useGame } from './store'

/**
 * Multiplayer through the game server's Colyseus rooms.
 *
 * `joinOrCreate('game')` puts the player in a lobby of up to 8; once every
 * lobby is full the server opens a new one. On Bloxity Legion hosting the
 * player first asks the matchmaker (play.bloxity.io) for a pod: it fills one to
 * 8, then boots another, and relays the socket to it. Everyone's pose (position, facing,
 * running speed, jumping, dying, treadmill) streams in ~15 times a second and
 * RemotePlayers draws them. If the server is offline the game just plays solo
 * and quietly retries.
 */

const SERVER_URL = (import.meta.env.VITE_MULTIPLAYER_URL || import.meta.env.VITE_API_URL || 'http://localhost:2567').replace(/\/$/, '')
/** Legion matchmaker, e.g. https://play.bloxity.io. Unset = connect straight to SERVER_URL. */
const MATCHMAKER_URL = (import.meta.env.VITE_MATCHMAKER_URL || '').replace(/\/$/, '')
const GAME_ID = import.meta.env.VITE_LEGION_GAME_ID || ''
/** Poses per second sent to the room. */
const SEND_HZ = 15
const RETRY_MS = [3000, 6000, 12000, 30000]
/** Reconnect delay when the server moves us off a pod that's shutting down. */
const HOP_MS = 800

/** React-facing status: who's in the room (ids only; their live state is in `net`). */
export const useNet = create(() => ({ status: 'offline', roomId: null, ids: [], max: 8 }))

/** Live, non-React state: the room and each remote player's synced schema object. */
export const net = {
  room: null,
  /** sessionId -> synced Player (fields update in place as patches arrive). */
  remotes: new Map(),
}
if (import.meta.env.DEV && typeof window !== 'undefined') window.__w2Net = net

let retry = 0
let retryTimer = null
let stopped = true
let unsubscribeProfile = null
/** The server said this pod is going away: reconnect at once, not after a backoff. */
let hopping = false

/** The player's Bloxity avatar (what others draw when they play as "Your Avatar"). */
function avatarPayload() {
  const { equipped, proportions } = useBloxityStore.getState()
  return JSON.stringify({ equipped: equipped || {}, proportions: proportions || {} })
}

function profile() {
  const s = useGame.getState()
  return {
    name: 'Player',
    anime: s.equipped || '',
    boots: s.boots || '',
    level: s.level,
    avatar: avatarPayload(),
  }
}

function publishIds() {
  useNet.setState({ ids: [...net.remotes.keys()] })
}

function scheduleRetry() {
  if (stopped) return
  clearTimeout(retryTimer)
  retryTimer = setTimeout(connect, RETRY_MS[Math.min(retry, RETRY_MS.length - 1)])
  retry += 1
}

/** Where to open the Colyseus client: a matchmaker relay to a live pod, or the server itself. */
async function roomEndpoint() {
  if (!MATCHMAKER_URL || !GAME_ID) return SERVER_URL
  const res = await fetch(`${MATCHMAKER_URL}/v1/play/${encodeURIComponent(GAME_ID)}`, { method: 'POST' })
  if (!res.ok) throw new Error(`matchmaker ${res.status}`)
  const { roomId } = await res.json()
  return `${MATCHMAKER_URL.replace(/^http/, 'ws')}/v1/ws/${roomId}`
}

async function connect() {
  if (stopped || net.room) return
  useNet.setState({ status: 'connecting' })
  try {
    // Ask again on every (re)connect: the pod we were on may be gone.
    const client = new Client(await roomEndpoint())
    // Join already standing where we are, so nobody sees us at the wrong spot.
    const room = await client.joinOrCreate('game', { ...profile(), pose: pose() })
    if (stopped) {
      room.leave()
      return
    }
    net.room = room
    retry = 0
    hopping = false
    useNet.setState({ status: 'online', roomId: room.roomId })
    // The name (or anime) may have changed while the join was in flight.
    room.send('profile', profile())

    const callbacks = Callbacks.get(room)
    callbacks.onAdd('players', (player, id) => {
      if (id === room.sessionId) return
      net.remotes.set(id, player)
      publishIds()
    })
    callbacks.onRemove('players', (_player, id) => {
      net.remotes.delete(id)
      publishIds()
    })
    room.onMessage('moving', () => {
      hopping = true
    })
    room.onLeave(() => {
      net.room = null
      net.remotes.clear()
      useNet.setState({ status: 'offline', roomId: null, ids: [] })
      if (hopping && !stopped) {
        clearTimeout(retryTimer)
        retryTimer = setTimeout(connect, HOP_MS)
      } else scheduleRetry()
    })
    room.onError(() => {})
  } catch {
    useNet.setState({ status: 'offline' })
    scheduleRetry()
  }
}

/** The local player's pose, as the room expects it. */
function pose() {
  const p = runtime.playerPos
  return {
    x: +p.x.toFixed(2),
    y: +p.y.toFixed(2),
    z: +p.z.toFixed(2),
    ry: +runtime.playerYaw.toFixed(3),
    spd: +runtime.moveSpeed.toFixed(1),
    gnd: runtime.grounded,
    dead: runtime.dead,
    stage: runtime.stage,
    flips: runtime.doubleJumps & 0xffff,
    tread: runtime.treadmill?.id || '',
  }
}

/**
 * Sends the local player's pose, SEND_HZ times a second. It runs on a timer,
 * not the render loop: browsers stop rendering background tabs, and a player
 * whose tab is hidden must still show up (and stay put) for everyone else.
 */
function sendPose() {
  net.room?.send('move', pose())
}

/** Joins a room and keeps the connection up; returns a stop function. */
export function startMultiplayer() {
  stopped = false
  // Give the Bloxity SDK a moment to report the avatar before joining.
  clearTimeout(retryTimer)
  retryTimer = setTimeout(connect, 1500)
  const sender = setInterval(sendPose, 1000 / SEND_HZ)
  // Re-send the profile when the name, anime, trail or level changes...
  unsubscribeProfile = useGame.subscribe((s, prev) => {
    if (!net.room) return
    if (s.equipped !== prev.equipped || s.boots !== prev.boots || s.level !== prev.level) {
      net.room.send('profile', profile())
    }
  })
  // ...and when the Bloxity outfit or body sliders change (live, from the portal).
  const unsubscribeAvatar = useBloxityStore.subscribe((s, prev) => {
    if (net.room && (s.equipped !== prev.equipped || s.proportions !== prev.proportions)) {
      net.room.send('profile', { avatar: avatarPayload() })
    }
  })
  return () => {
    stopped = true
    clearTimeout(retryTimer)
    clearInterval(sender)
    unsubscribeProfile?.()
    unsubscribeAvatar()
    net.room?.leave()
    net.room = null
    net.remotes.clear()
    useNet.setState({ status: 'offline', roomId: null, ids: [] })
  }
}
