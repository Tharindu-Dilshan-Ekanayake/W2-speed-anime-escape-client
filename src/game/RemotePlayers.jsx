import { useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'

import AnimeCharacter from './AnimeCharacter'
import { ANIMES, AVATAR_ID, bootsById, characterById } from './config'
import Aura from './fx/Aura'
import RunFx from './fx/RunFx'
import { net, useNet } from './multiplayer'
import PlayerAvatar from './PlayerAvatar'
import { runtime } from './runtime'
import SafeBoundary from './SafeBoundary'

/** The capsule's centre sits this far above the feet (the model's origin). */
const FEET = 0.9
/** Other players further away than this aren't drawn. */
const DRAW_DISTANCE = 130
/** A jump in position bigger than this is a teleport: snap instead of gliding. */
const SNAP_DISTANCE = 12
/** The double-jump somersault, as for the local player (Player.jsx). */
const FLIP_S = 0.55

const _target = new Vector3()

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** The synced avatar JSON ({ equipped, proportions }), or a bare default body. */
function parseAvatar(json) {
  try {
    const data = JSON.parse(json)
    return { equipped: data?.equipped || null, proportions: data?.proportions || null }
  } catch {
    return { equipped: null, proportions: null }
  }
}

/** Shortest signed angle from a to b. */
function angleTo(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Another player in the room, shown the way you show yourself: their own
 * Bloxity avatar or the anime they wear, running, jumping, doing the double-jump
 * flip, riding a treadmill or toppling over - with their aura, running effect,
 * glowing footprints and level-up burst. No names or account details are shown.
 */
function RemotePlayer({ id }) {
  const [info, setInfo] = useState(() => {
    const p = net.remotes.get(id)
    return { anime: p?.anime, avatar: p?.avatar, boots: p?.boots }
  })
  const groupRef = useRef(null)
  const tiltRef = useRef(null)
  const flipRef = useRef(null)
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: 6, dead: false })
  const smooth = useRef(null)
  const flipT = useRef(-1)
  const seen = useRef({ flips: null, level: null, gnd: true })
  const stride = useRef({ acc: 0, side: 1 })

  /** What the running effect follows: this player's stand-in for the local `runtime`. */
  const src = useMemo(
    () => ({ playerPos: new Vector3(), teleports: 0, dead: true, moveSpeed: 0, grounded: true, jumps: 0, lands: 0, playerModel: null, time: 0 }),
    [],
  )
  const onModel = useCallback(
    (model) => {
      src.playerModel = model
    },
    [src],
  )

  useFrame((_state, rawDt) => {
    const p = net.remotes.get(id)
    const group = groupRef.current
    if (!p || !group) return
    const dt = Math.min(rawDt, 0.1)
    if (p.anime !== info.anime || p.avatar !== info.avatar || p.boots !== info.boots) {
      setInfo({ anime: p.anime, avatar: p.avatar, boots: p.boots })
    }

    // No real position yet (or a bad one): hide rather than glide toward NaN,
    // which would stick forever since NaN never lerps back.
    if (![p.x, p.y, p.z].every(Number.isFinite)) {
      group.visible = false
      src.dead = true
      return
    }
    _target.set(p.x, p.y - FEET, p.z)
    const me = runtime.playerPos
    const visible = Math.hypot(p.x - me.x, p.z - me.z) < DRAW_DISTANCE
    group.visible = visible
    const ry = Number.isFinite(p.ry) ? p.ry : 0
    if (!smooth.current || !Number.isFinite(smooth.current.pos.x)) {
      smooth.current = { pos: _target.clone(), yaw: ry, tilt: 0 }
    }
    const s = smooth.current
    // Glide toward the latest pose (they arrive ~15 times a second).
    let snapped = false
    if (s.pos.distanceTo(_target) > SNAP_DISTANCE) {
      s.pos.copy(_target)
      snapped = true
    } else s.pos.lerp(_target, 1 - Math.exp(-14 * dt))
    s.yaw += angleTo(s.yaw, ry) * (1 - Math.exp(-12 * dt))
    s.tilt += ((p.dead ? Math.PI / 2 : 0) - s.tilt) * Math.min(1, dt * 6)

    // Feed the running effect, and play their jumps / landings in it.
    src.playerPos.set(s.pos.x, s.pos.y + FEET, s.pos.z)
    src.moveSpeed = visible ? p.spd || 0 : 0
    src.grounded = p.gnd
    src.dead = !visible || p.dead
    if (snapped) src.teleports += 1
    const last = seen.current
    if (last.gnd && !p.gnd) src.jumps += 1
    if (!last.gnd && p.gnd) src.lands += 1
    last.gnd = p.gnd

    // A new double-jump flip.
    if (last.flips === null) last.flips = p.flips
    if (p.flips !== last.flips) {
      last.flips = p.flips
      flipT.current = 0
    }
    // A level up: the same burst of light as your own.
    if (last.level === null) last.level = p.level
    if (p.level > last.level && visible) {
      const char = characterById(p.anime)
      runtime.bursts.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, color: char.aura?.color || '#ffe23a' })
    }
    last.level = p.level

    if (!visible) return

    group.position.copy(s.pos)
    group.rotation.y = s.yaw
    if (tiltRef.current) tiltRef.current.rotation.x = -s.tilt
    if (flipRef.current) {
      if (flipT.current >= 0) {
        flipT.current += dt
        const t = Math.min(1, flipT.current / FLIP_S)
        flipRef.current.rotation.x = easeInOut(t) * Math.PI * 2
        if (t >= 1 || (p.gnd && flipT.current > 0.15)) {
          flipT.current = -1
          flipRef.current.rotation.x = 0
        }
      }
    }

    const motion = motionRef.current
    motion.time += dt
    motion.speed = p.spd || 0
    motion.grounded = p.gnd
    motion.dead = p.dead

    // Footprints, stamped on the same stride as your own.
    if (p.gnd && !p.dead && motion.speed > 1.5) {
      const st = stride.current
      st.acc += dt * 2 * Math.min(5.2, 0.85 + 0.12 * motion.speed)
      if (st.acc >= 1) {
        st.acc %= 1
        st.side = -st.side
        const print = characterById(p.anime).print
        const off = st.side * 0.17
        runtime.footprints.push({
          x: s.pos.x + Math.cos(s.yaw) * off,
          y: s.pos.y + 0.035,
          z: s.pos.z - Math.sin(s.yaw) * off,
          yaw: s.yaw,
          side: st.side,
          print,
        })
      }
    }
  })

  const avatarLook = useMemo(() => parseAvatar(info.avatar), [info.avatar])
  const character = characterById(info.anime)
  const boots = bootsById(info.boots)
  const look = useMemo(() => (character.look && boots ? { ...character.look, shoes: boots.color } : character.look), [character, boots])
  const fallback = <AnimeCharacter look={ANIMES[0].look} motionRef={motionRef} />
  return (
    <>
      <group ref={groupRef}>
        <Aura character={character} boots={boots} motionRef={motionRef} />
        <group ref={tiltRef}>
          {/* The flip pivots round the hips, as for the local player. */}
          <group ref={flipRef} position={[0, FEET, 0]}>
            <group position={[0, -FEET, 0]}>
              {info.anime === AVATAR_ID || !look ? (
                <SafeBoundary fallback={fallback}>
                  <Suspense fallback={null}>
                    <PlayerAvatar look={avatarLook} motionRef={motionRef} targetHeight={FEET * 2} />
                  </Suspense>
                </SafeBoundary>
              ) : (
                <AnimeCharacter look={look} motionRef={motionRef} onModel={onModel} />
              )}
            </group>
          </group>
        </group>
      </group>
      {/* Particles live in world space, so they sit outside the moving group. */}
      <RunFx src={src} animeId={info.anime || AVATAR_ID} />
    </>
  )
}

/** Everyone else in the room. */
export function RemotePlayers() {
  const ids = useNet((s) => s.ids)
  return ids.map((id) => <RemotePlayer key={id} id={id} />)
}

export default RemotePlayers
