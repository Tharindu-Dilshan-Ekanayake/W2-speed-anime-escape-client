import { useEffect, useRef } from 'react'


/**
 * Keyboard state in a ref, deliberately *not* React state: movement is read every
 * frame inside `useFrame`, and routing keys through React would re-render the
 * scene 60x a second.
 *
 *   W / S (or Up / Down)  run forward / back
 *   A / D (or Left/Right) swing the camera (and so steer the run)
 *   Space                 jump - press again in the air for a double-jump flip
 *   E                     use the "[E]" prompt (buy / wear / unlock)
 *
 * While the dev panel is open the Left / Right arrows switch stages instead.
 */
const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'jump',
  KeyE: 'interact',
}

const isTyping = (e) => {
  const el = e.target
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable
}

export function useKeyboard() {
  const keys = useRef({ forward: false, backward: false, turnLeft: false, turnRight: false, jump: false, interact: false })

  useEffect(() => {
    const set = (e, value) => {
      const action = KEY_MAP[e.code]
      if (action) keys.current[action] = value
    }
    const onKeyDown = (e) => {
      if (isTyping(e)) return
      if (KEY_MAP[e.code]) e.preventDefault()
      set(e, true)
    }
    const onKeyUp = (e) => set(e, false)
    const onBlur = () => {
      for (const action of Object.keys(keys.current)) keys.current[action] = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return keys
}

export default useKeyboard
