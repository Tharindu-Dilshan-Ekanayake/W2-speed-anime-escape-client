import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { runtime } from './runtime'

/** How high above the player's origin the camera aims. */
const LOOK_HEIGHT = 1.4

const MIN_DISTANCE = 3
const MAX_DISTANCE = 34
const START_DISTANCE = 11

// Pitch limits, in radians. Stops the camera flipping over the top or sinking
// under the track.
const MIN_PITCH = -0.15
const MAX_PITCH = 1.25
const START_PITCH = 0.3

const DRAG_SENSITIVITY = 0.005
const TOUCH_SENSITIVITY = 0.008
const ZOOM_SENSITIVITY = 0.01
/** A / D turn the camera this fast (radians per second) once fully spun up. */
const TURN_RATE = 2.6
/** How quickly a key turn spins up and settles (per second). */
const TURN_EASE = 10
/** Keep this far in front of a wall the camera would otherwise sink into. */
const WALL_PADDING = 0.45

/** Field of view at rest, and how much wider it gets flat out (the anime speed kick). */
const BASE_FOV = 70
const SPEED_FOV = 14
/** On a tall (portrait phone) screen the view widens up to this, so the sides aren't cut off. */
const PORTRAIT_FOV_MAX = 92

/** The vertical field of view at rest for the screen's shape. */
const baseFov = (aspect) => (aspect >= 1 ? BASE_FOV : Math.min(PORTRAIT_FOV_MAX, BASE_FOV + (1 - aspect) * 40))

/** How quickly the camera eases back out after a wall stops blocking it. */
const ZOOM_OUT_RATE = 1.5

const _desired = new Vector3()
const _target = new Vector3()
const _dir = new Vector3()

/** Widen the view as the player speeds up, so fast feels fast. */
function speedKick(camera, delta) {
  const kick = Math.min(1, Math.max(0, (runtime.moveSpeed - 6) / 14))
  const fov = camera.fov + (baseFov(camera.aspect) + SPEED_FOV * kick - camera.fov) * Math.min(1, delta * 3)
  if (Math.abs(fov - camera.fov) > 0.01) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
}

/**
 * Third-person orbit camera, Roblox style.
 *
 * Right-click drag (or a one-finger drag on the right half of a touch screen)
 * orbits, the mouse wheel zooms. A ray from the player to the camera pulls it in
 * front of walls, so it never looks through the stage corridors.
 *
 * Must be rendered inside <Physics> (it ray-casts against the colliders).
 *
 * @param {{ bodyRef: React.MutableRefObject<any> }} props
 */
export function FollowCamera({ bodyRef }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const { rapier, world } = useRapier()

  const orbit = useRef({ yaw: 0, pitch: START_PITCH, distance: START_DISTANCE })
  /** Current (possibly wall-shortened) camera distance. */
  const zoom = useRef(START_DISTANCE)
  /** Current A / D turn rate, eased so a tap nudges and a hold swings round. */
  const turn = useRef(0)
  const initialised = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    if (!el) return

    let dragging = false
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e) => {
      if (e.button !== 2) return // right button only
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture?.(e.pointerId)
    }

    const onPointerMove = (e) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const o = orbit.current
      o.yaw -= dx * DRAG_SENSITIVITY
      o.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, o.pitch + dy * DRAG_SENSITIVITY))
    }

    const endDrag = (e) => {
      if (!dragging) return
      dragging = false
      el.releasePointerCapture?.(e.pointerId)
    }

    const onWheel = (e) => {
      e.preventDefault()
      const o = orbit.current
      o.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, o.distance + e.deltaY * ZOOM_SENSITIVITY))
    }

    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((_state, delta) => {
    const body = bodyRef.current
    if (!body) return
    const o = orbit.current

    // Teleports snap the camera behind the player.
    if (runtime.cameraYaw !== null) {
      o.yaw = runtime.cameraYaw
      runtime.cameraYaw = null
      initialised.current = false
    }
    // A / D swing the camera; W then runs the new way, so holding W + A curves left.
    turn.current += (runtime.turnInput - turn.current) * Math.min(1, TURN_EASE * delta)
    if (Math.abs(turn.current) > 0.001) o.yaw -= turn.current * TURN_RATE * delta

    // Touch orbit deltas from TouchControls.
    if (runtime.orbitDelta.x || runtime.orbitDelta.y) {
      o.yaw -= runtime.orbitDelta.x * TOUCH_SENSITIVITY
      o.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, o.pitch + runtime.orbitDelta.y * TOUCH_SENSITIVITY))
      runtime.orbitDelta.x = 0
      runtime.orbitDelta.y = 0
    }

    const pos = body.translation()
    _target.set(pos.x, pos.y + LOOK_HEIGHT, pos.z)

    // Spherical -> cartesian. yaw 0 puts the camera behind the player on +Z.
    const horizontal = Math.cos(o.pitch) * o.distance
    _desired.set(
      _target.x + Math.sin(o.yaw) * horizontal,
      _target.y + Math.sin(o.pitch) * o.distance,
      _target.z + Math.cos(o.yaw) * horizontal,
    )

    // Pull in front of any wall between the player and the camera.
    _dir.subVectors(_desired, _target)
    const length = _dir.length()
    let blocked = false
    if (length > 0.001) {
      _dir.divideScalar(length)
      const ray = new rapier.Ray(_target, _dir)
      const hit = world.castRay(ray, length, true, undefined, undefined, undefined, body)
      if (hit && hit.timeOfImpact < length) {
        const safe = Math.max(0.5, hit.timeOfImpact - WALL_PADDING)
        _desired.copy(_target).addScaledVector(_dir, safe)
        blocked = true
      }
    }

    // Rigid follow like Roblox's camera: at high walk speeds any positional easing
    // leaves the player metres ahead of the frame. Only zoom-in from a wall eases out.
    if (!initialised.current || blocked) {
      initialised.current = true
      zoom.current = _desired.distanceTo(_target)
    } else if (length <= zoom.current) {
      zoom.current = length
    } else {
      zoom.current += (length - zoom.current) * (1 - Math.pow(0.001, delta * ZOOM_OUT_RATE))
      _desired.copy(_target).addScaledVector(_dir, Math.min(length, zoom.current))
    }
    camera.position.copy(_desired)
    camera.lookAt(_target)
    speedKick(camera, delta)
  })

  return null
}

export default FollowCamera
