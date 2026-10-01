import { useEffect, useRef, useState } from 'react'

import { runtime } from '../game/runtime'

const STICK_RADIUS = 60

/**
 * Mobile controls, only on touch screens: a dynamic thumbstick on the left half,
 * camera drag on the right half, and a jump button - Roblox mobile style.
 */
export function TouchControls() {
  const [enabled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,
  )
  const [stick, setStick] = useState(null)
  const pointers = useRef(new Map())

  useEffect(() => {
    return () => {
      runtime.touchMove.x = 0
      runtime.touchMove.y = 0
      runtime.touchJump = false
    }
  }, [])

  if (!enabled) return null

  const onDown = (e) => {
    const left = e.clientX < window.innerWidth * 0.45
    pointers.current.set(e.pointerId, { kind: left ? 'stick' : 'look', x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
    if (left) setStick({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 })
  }

  const onMove = (e) => {
    const p = pointers.current.get(e.pointerId)
    if (!p) return
    if (p.kind === 'stick') {
      let dx = e.clientX - p.x
      let dy = e.clientY - p.y
      const len = Math.hypot(dx, dy)
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS
        dy = (dy / len) * STICK_RADIUS
      }
      runtime.touchMove.x = dx / STICK_RADIUS
      runtime.touchMove.y = -dy / STICK_RADIUS
      setStick({ ox: p.x, oy: p.y, dx, dy })
    } else {
      runtime.orbitDelta.x += e.clientX - p.x
      runtime.orbitDelta.y += e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
    }
  }

  const onUp = (e) => {
    const p = pointers.current.get(e.pointerId)
    pointers.current.delete(e.pointerId)
    if (p?.kind === 'stick') {
      runtime.touchMove.x = 0
      runtime.touchMove.y = 0
      setStick(null)
    }
  }

  return (
    <>
      <div
        className="touch-layer"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {stick && (
        <div className="stick" style={{ left: stick.ox, top: stick.oy }}>
          <div className="stick-knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
        </div>
      )}
      <button
        type="button"
        className="jump-btn"
        onPointerDown={() => {
          runtime.touchJump = true
        }}
        onPointerUp={() => {
          runtime.touchJump = false
        }}
        onPointerCancel={() => {
          runtime.touchJump = false
        }}
        aria-label="Jump"
      >
        ⤒
      </button>
    </>
  )
}

export default TouchControls
