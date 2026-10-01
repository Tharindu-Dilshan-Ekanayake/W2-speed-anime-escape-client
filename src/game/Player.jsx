import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import AnimeCharacter from './AnimeCharacter'
import {
  ANIMES,
  bootsById,
  characterById,
  DOUBLE_JUMP_HEIGHT,
  JUMP_HEIGHT,
  jumpVelocity,
  KILL_Y,
  STEP_SECONDS,
} from './config'
import Aura from './fx/Aura'
import { killPlayer } from './gameplay'
import { SPAWN, stageAtZ } from './layout'
import PlayerAvatar from './PlayerAvatar'
import { runtime } from './runtime'
import SafeBoundary from './SafeBoundary'
import { setWind, sfx } from './sfx'
import { useGame } from './store'
import useKeyboard from './useKeyboard'
import { updateZones } from './zones'

// Capsule roughly matching the 1.8m humanoid. Rapier's capsule args are the
// half-height of the cylinder and the radius: total height = 2 * (half + radius).
const CAPSULE_RADIUS = 0.35
const CAPSULE_HALF_HEIGHT = 0.55
export const PLAYER_HEIGHT = 2 * (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS)
const FEET = PLAYER_HEIGHT / 2

const GROUND_RAY_SLACK = 0.18
const JUMP_COOLDOWN_S = 0.18
/** Grace period after running off a ledge in which a jump still counts as grounded. */
const COYOTE_S = 0.12
/** The double jump's somersault. */
const FLIP_S = 0.55
/** Rapier's CoefficientCombineRule.Min. */
const FRICTION_MIN = 1

const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _rayOrigin = { x: 0, y: 0, z: 0 }
const _down = { x: 0, y: -1, z: 0 }
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)

/** Model facing (radians about Y) for "looking away from a camera at `yaw`". */
const facingForYaw = (yaw) => Math.atan2(-Math.sin(yaw), -Math.cos(yaw))
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** The moving platform under the feet, if any. */
function moverUnder(x, feetY, z) {
  for (const m of runtime.movers) {
    if (Math.abs(x - m.x) < m.half[0] + 0.3 && Math.abs(z - m.z) < m.half[1] + 0.3 && feetY > -0.4 && feetY < 0.6) return m
  }
  return null
}

/**
 * The player: a dynamic Rapier capsule wearing either the player's own Bloxity
 * avatar or an anime's blocky model, with its aura.
 *
 * Every frame it also: runs the trigger zones and hazards, gains Speed every
 * step (or on a treadmill), stamps footprints, handles death, teleports and the
 * double-jump flip.
 */
export function Player({ onAvatarReady, bodyRef: externalBodyRef }) {
  const localBodyRef = useRef(null)
  const bodyRef = externalBodyRef || localBodyRef
  const visualRef = useRef(null)
  const tiltRef = useRef(null)
  const flipRef = useRef(null)
  const keys = useKeyboard()
  const { rapier, world } = useRapier()

  const character = characterById(useGame((s) => s.equipped))
  const boots = bootsById(useGame((s) => s.boots))
  const look = useMemo(() => {
    if (!character.look) return null
    return boots ? { ...character.look, shoes: boots.color } : character.look
  }, [character, boots])

  const jumpCooldown = useRef(0)
  const jumpHeld = useRef(false)
  const interactHeld = useRef(false)
  const airJumps = useRef(0)
  const coyote = useRef(0)
  const stepTimer = useRef(0)
  const flipT = useRef(-1)
  const deathTilt = useRef(0)
  const hold = useRef(null)
  const wasGrounded = useRef(true)
  const airTime = useRef(0)
  const fallSpeed = useRef(0)
  const strideAcc = useRef(0)
  const footSide = useRef(1)

  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: 6, dead: false })

  useEffect(() => {
    if (look) onAvatarReady?.()
  }, [look, onAvatarReady])

  const castDown = (x, y, z, body, max) => {
    _rayOrigin.x = x
    _rayOrigin.y = y
    _rayOrigin.z = z
    const hit = world.castRay(new rapier.Ray(_rayOrigin, _down), max, true, undefined, undefined, undefined, body)
    return hit !== null && hit.timeOfImpact <= max
  }

  /** Grounded if a short ray from the centre (or near the capsule's rim) hits floor. */
  const isGrounded = (body) => {
    const p = body.translation()
    const max = FEET + GROUND_RAY_SLACK
    if (castDown(p.x, p.y, p.z, body, max)) return true
    const r = CAPSULE_RADIUS * 0.8
    return (
      castDown(p.x + r, p.y, p.z, body, max) ||
      castDown(p.x - r, p.y, p.z, body, max) ||
      castDown(p.x, p.y, p.z + r, body, max) ||
      castDown(p.x, p.y, p.z - r, body, max)
    )
  }

  useFrame((state, rawDelta) => {
    const body = bodyRef.current
    if (!body) return
    const dt = Math.min(rawDelta, 0.05)
    const motion = motionRef.current
    motion.time += dt
    const now = performance.now()

    // --- Teleport (respawn, win pad, teleport menu, dev switcher) ----------------
    if (runtime.teleport) {
      const { position, yaw } = runtime.teleport
      runtime.teleport = null
      runtime.stunUntil = 0
      runtime.teleports += 1
      hold.current = position
      body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      runtime.playerPos.set(position[0], position[1], position[2])
      runtime.cameraYaw = yaw
      runtime.treadmill = null
      if (visualRef.current) visualRef.current.rotation.set(0, facingForYaw(yaw), 0)
      deathTilt.current = 0
      if (tiltRef.current) tiltRef.current.rotation.x = 0
      flipT.current = -1
      if (flipRef.current) flipRef.current.rotation.x = 0
      motion.dead = false
      return
    }
    // Hold still while the destination's colliders mount.
    if (now < runtime.freezeUntil && hold.current) {
      const p = hold.current
      body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }

    // --- Dead: freeze and topple ------------------------------------------------------
    if (runtime.dead) {
      body.setTranslation(runtime.deathPos, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      deathTilt.current = Math.min(Math.PI / 2, deathTilt.current + dt * 5)
      if (tiltRef.current) tiltRef.current.rotation.x = -deathTilt.current
      motion.dead = true
      motion.speed = 0
      runtime.moveSpeed = 0
      setWind(0)
      return
    }

    jumpCooldown.current = Math.max(0, jumpCooldown.current - dt)
    const k = keys.current
    const grounded = isGrounded(body)
    if (grounded) coyote.current = COYOTE_S
    else coyote.current = Math.max(0, coyote.current - dt)
    runtime.turnInput = Math.max(-1, Math.min(1, (k.turnRight ? 1 : 0) - (k.turnLeft ? 1 : 0) + runtime.buttonTurn))

    // --- Horizontal movement, relative to the camera --------------------------------
    _input.set(runtime.touchMove.x, 0, (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - runtime.touchMove.y)
    const inputActive = _input.lengthSq() > 0.01
    const game = useGame.getState()
    const speed = game.walkSpeed()
    const pos0 = body.translation()
    const mover = moverUnder(pos0.x, pos0.y - FEET, pos0.z)
    const baseX = mover ? mover.vx : 0
    const baseZ = mover ? mover.vz : 0
    const linvel = body.linvel()

    // A tornado has hold of us: no steering until it lets go (and by then we are over the water).
    const stunned = now < runtime.stunUntil
    if (stunned) {
      body.setLinvel({ x: runtime.blow.x, y: linvel.y, z: runtime.blow.z }, true)
      if (visualRef.current) visualRef.current.rotation.y += dt * 14
    } else if (inputActive) {
      const magnitude = Math.min(1, _input.length())
      _input.normalize()
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move.set(0, 0, 0).addScaledVector(_camForward, -_input.z).addScaledVector(_camRight, _input.x).normalize()
      body.setLinvel({ x: _move.x * speed * magnitude + baseX, y: linvel.y, z: _move.z * speed * magnitude + baseZ }, true)
      if (visualRef.current) {
        _targetQuat.setFromAxisAngle(_up, Math.atan2(_move.x, _move.z))
        visualRef.current.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0001, dt))
      }
    } else {
      body.setLinvel({ x: baseX + (linvel.x - baseX) * 0.6, y: linvel.y, z: baseZ + (linvel.z - baseZ) * 0.6 }, true)
    }

    // Treadmills: stand still on an unlocked one and you run in place.
    const tread = runtime.treadmill
    const onTread = !!tread && grounded && !inputActive && tread.isOwned()
    if (onTread && visualRef.current) {
      _targetQuat.setFromAxisAngle(_up, tread.face > 0 ? 0 : Math.PI)
      visualRef.current.quaternion.slerp(_targetQuat, 1 - Math.pow(0.001, dt))
    }

    // --- Jump, and the double jump with a somersault -----------------------------------
    const jumpDown = !stunned && (k.jump || runtime.touchJump)
    const jumpPressed = jumpDown && !jumpHeld.current
    jumpHeld.current = jumpDown
    if (grounded && jumpCooldown.current === 0) airJumps.current = 0
    if (jumpDown && coyote.current > 0 && jumpCooldown.current === 0 && (jumpPressed || grounded)) {
      const v = body.linvel()
      body.setLinvel({ x: v.x, y: jumpVelocity(JUMP_HEIGHT), z: v.z }, true)
      jumpCooldown.current = JUMP_COOLDOWN_S
      coyote.current = 0
      runtime.jumps += 1
      sfx.jump()
    } else if (jumpPressed && coyote.current === 0 && airJumps.current === 0) {
      airJumps.current = 1
      const v = body.linvel()
      body.setLinvel({ x: v.x, y: jumpVelocity(DOUBLE_JUMP_HEIGHT), z: v.z }, true)
      runtime.jumps += 1
      runtime.doubleJumps += 1
      flipT.current = 0
      sfx.doubleJump()
    }
    if (flipT.current >= 0 && flipRef.current) {
      flipT.current += dt
      const t = Math.min(1, flipT.current / FLIP_S)
      flipRef.current.rotation.x = easeInOut(t) * Math.PI * 2
      if (t >= 1 || (grounded && flipT.current > 0.15)) {
        flipT.current = -1
        flipRef.current.rotation.x = 0
      }
    }

    // --- Zones, hazards, falling ----------------------------------------------------------
    const pos = body.translation()
    runtime.playerPos.set(pos.x, pos.y, pos.z)
    const feetY = pos.y - FEET
    if (grounded) runtime.groundY = feetY
    const { killed, prompt, blow } = updateZones(pos.x, feetY, pos.z)
    if (blow && !stunned) {
      runtime.stunUntil = now + 2200
      runtime.blow.x = blow.vx
      runtime.blow.z = blow.vz
      body.setLinvel({ x: blow.vx, y: blow.vy, z: blow.vz }, true)
      sfx.gust()
      sfx.hit()
    }
    game.setPrompt(prompt ? { text: prompt.text, cost: prompt.cost, color: prompt.color } : null)
    runtime.promptAction = prompt?.action ?? null
    if (k.interact && !interactHeld.current) runtime.promptAction?.()
    interactHeld.current = k.interact
    if (killed) {
      killPlayer('hazard')
      return
    }
    if (feetY < KILL_Y) {
      killPlayer('fluid')
      return
    }

    // Which stage are we in? Re-centres the mounted world when it changes.
    const stage = stageAtZ(pos.z)
    if (stage !== runtime.stage) {
      runtime.stage = stage
      if (game.zone !== stage) useGame.setState({ zone: stage })
    }

    // --- Speed: one step every STEP_SECONDS of running (or on a treadmill) ----------------
    const nowVel = body.linvel()
    const horizontal = Math.hypot(nowVel.x - baseX, nowVel.z - baseZ)
    const running = inputActive && horizontal > 1
    if (running || onTread) {
      stepTimer.current += dt
      if (stepTimer.current >= STEP_SECONDS) {
        stepTimer.current -= STEP_SECONDS
        const gain = game.stepSpeed(onTread ? tread.mult : 1)
        runtime.floaters.push({ value: gain, x: pos.x, y: pos.y + 1.4, z: pos.z })
        runtime.steps += 1
      }
    }

    // --- Publish motion for the pose and the effects ---------------------------------------
    motion.dead = false
    motion.grounded = grounded
    motion.maxSpeed = Math.max(speed, 0.1)
    motion.speed = onTread ? Math.max(speed, 7) : horizontal
    runtime.moveSpeed = motion.speed
    runtime.grounded = grounded
    if (visualRef.current) {
      const q = visualRef.current.quaternion
      runtime.playerYaw = 2 * Math.atan2(q.y, q.w)
    }

    // --- Landing, footsteps, footprints ------------------------------------------------------
    if (grounded && !wasGrounded.current && airTime.current > 0.25) {
      runtime.lands += 1
      sfx.land(fallSpeed.current / 18)
    }
    if (grounded) airTime.current = 0
    else {
      airTime.current += dt
      fallSpeed.current = Math.max(0, -nowVel.y)
    }
    wasGrounded.current = grounded
    if (grounded && motion.speed > 1.5) {
      strideAcc.current += dt * 2 * Math.min(5.2, 0.85 + 0.12 * motion.speed)
      if (strideAcc.current >= 1) {
        strideAcc.current %= 1
        footSide.current = -footSide.current
        sfx.step(footSide.current > 0, Math.min(1, motion.speed / 30))
        if (!onTread) {
          const yaw = runtime.playerYaw
          const side = footSide.current * 0.17
          runtime.footprints.push({
            x: pos.x + Math.cos(yaw) * side,
            y: feetY + 0.035,
            z: pos.z - Math.sin(yaw) * side,
            yaw,
            side: footSide.current,
          })
        }
      }
    }
    setWind(motion.speed / 20)
  })

  return (
    <RigidBody
      ref={bodyRef}
      position={SPAWN.position}
      colliders={false}
      mass={1}
      enabledRotations={[false, false, false]}
      friction={0}
      linearDamping={0.1}
      ccd
      name="player"
    >
      <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} friction={0} frictionCombineRule={FRICTION_MIN} />
      {/* Model origin is at the feet; the capsule origin is at its centre. */}
      <group ref={visualRef} position={[0, -FEET, 0]} rotation={[0, Math.PI, 0]}>
        <Aura character={character} boots={boots} motionRef={motionRef} />
        <group ref={tiltRef}>
          {/* The flip pivots round the hips. */}
          <group ref={flipRef} position={[0, FEET, 0]}>
            <group position={[0, -FEET, 0]}>
              {look ? (
                <AnimeCharacter look={look} motionRef={motionRef} publish />
              ) : (
                <SafeBoundary onError={onAvatarReady} fallback={<AnimeCharacter look={ANIMES[0].look} motionRef={motionRef} publish />}>
                  <Suspense fallback={null}>
                    <PlayerAvatar local onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} />
                  </Suspense>
                </SafeBoundary>
              )}
            </group>
          </group>
        </group>
      </group>
    </RigidBody>
  )
}

export default Player
