import { useMemo } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

import { FONT } from '../textures'

/**
 * Another player's name floating over their head, Roblox style: bold sky-blue
 * text with a dark outline and no background. Sized in the world, so it shrinks
 * with distance like the player does.
 */

const cache = new Map()

function draw(name) {
  const size = 96
  const pad = 36
  const probe = document.createElement('canvas').getContext('2d')
  const font = `700 ${size}px ${FONT}, sans-serif`
  probe.font = font
  const c = document.createElement('canvas')
  c.width = Math.ceil(probe.measureText(name).width + pad * 2)
  c.height = Math.ceil(size * 1.3)
  const ctx = c.getContext('2d')
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 14
  ctx.strokeStyle = '#101820'
  ctx.strokeText(name, c.width / 2, c.height / 2)
  ctx.fillStyle = '#6fd0ff'
  ctx.fillText(name, c.width / 2, c.height / 2)
  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  return { texture, aspect: c.width / c.height }
}

function tagFor(name) {
  if (!cache.has(name)) {
    if (cache.size > 60) {
      for (const v of cache.values()) v.texture.dispose()
      cache.clear()
    }
    cache.set(name, draw(name))
  }
  return cache.get(name)
}

export function NameTag({ name, y = 2.35 }) {
  const { texture, aspect } = useMemo(() => tagFor(name || 'Player'), [name])
  const h = 0.5
  return (
    <sprite position={[0, y, 0]} scale={[h * aspect, h, 1]} renderOrder={15}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} fog={false} />
    </sprite>
  )
}

export default NameTag
