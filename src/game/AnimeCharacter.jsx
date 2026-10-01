import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'

import { animateModel, buildAnimeModel, disposeModel } from './animeModel'
import { runtime } from './runtime'

const IDLE = { time: 0, speed: 0, grounded: true, maxSpeed: 6 }

/**
 * @param {{ look: object, motionRef?: { current: object }, idleOffset?: number,
 *   publish?: boolean }} props
 *   Without a motionRef the character just idles (lobby NPCs). `publish` shares the
 *   model with the run effects (the player's own character).
 */
export function AnimeCharacter({ look, motionRef, idleOffset = 0, publish = false, onModel, ...props }) {
  const model = useMemo(() => buildAnimeModel(look), [look])
  useEffect(() => () => disposeModel(model), [model])

  // Hands the model (its joints) to whoever draws effects for it, e.g. another player's afterimages.
  useEffect(() => {
    onModel?.(model)
    return () => onModel?.(null)
  }, [model, onModel])

  useEffect(() => {
    if (!publish) return undefined
    runtime.playerModel = model
    return () => {
      if (runtime.playerModel === model) runtime.playerModel = null
    }
  }, [model, publish])

  useFrame((state, dt) => {
    if (motionRef?.current) animateModel(model, motionRef.current, dt)
    else {
      IDLE.time = state.clock.elapsedTime + idleOffset
      animateModel(model, IDLE, dt)
    }
  })

  return (
    <group {...props}>
      <primitive object={model.root} />
    </group>
  )
}

export default AnimeCharacter
