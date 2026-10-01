import { useEffect, useState } from 'react'

/**
 * Mounts a heavy piece in `steps` stages, one every few frames (all at once when
 * `eager`), so a big piece (a canvas-drawn sign, say) never lands in one frame.
 * Returns how many stages are mounted so far.
 */
export function useStaged(steps, eager) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (eager || step >= steps) return undefined
    const id = setTimeout(() => setStep((c) => c + 1), 40)
    return () => clearTimeout(id)
  }, [eager, step, steps])
  return eager ? steps : step
}

export default useStaged
