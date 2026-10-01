import { useCallback, useRef, useState } from 'react'

import { STAGE_COUNT } from '../config'
import { useGame } from '../store'
import Lobby from './Lobby'
import { BeltDriver } from './Pads'
import Stage from './Stage'

/**
 * Mounts the part of the map around the player: the stage they are in plus its
 * neighbours (the lobby is always there). Twenty stages of colliders and
 * scenery at once would be far too heavy; this keeps it to three. Stages the
 * player leaves behind are taken apart piece by piece (see Stage.jsx), never in
 * one frame.
 */
export function World() {
  const zone = useGame((s) => s.zone)
  const dead = useGame((s) => s.dead)
  const wanted = []
  for (let n = zone - 1; n <= zone + 1; n += 1) if (n >= 1 && n <= STAGE_COUNT) wanted.push(n)

  // Stages that were wanted a moment ago and are still being taken apart.
  const [leavingList, setLeavingList] = useState([])
  const prevWanted = useRef(wanted)
  if (prevWanted.current.join() !== wanted.join()) {
    const stillNeeded = [...new Set([...leavingList, ...prevWanted.current])].filter((n) => !wanted.includes(n))
    prevWanted.current = wanted
    setLeavingList(stillNeeded)
  }
  const gone = useCallback((n) => setLeavingList((l) => (l.includes(n) ? l.filter((x) => x !== n) : l)), [])

  const all = [...wanted, ...leavingList.filter((n) => !wanted.includes(n))].sort((a, b) => a - b)
  return (
    <>
      <BeltDriver />
      {/* The lobby stays mounted (coming back is instant), but its animated characters only while the player is near - or dying, which is when they return. */}
      <Lobby near={zone <= 1 || dead} />
      {all.map((n) => (
        <Stage key={n} n={n} eager={n === zone} leaving={!wanted.includes(n)} onGone={() => gone(n)} />
      ))}
    </>
  )
}

export default World
