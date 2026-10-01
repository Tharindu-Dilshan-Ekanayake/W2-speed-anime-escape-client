import { useFrame } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { useContext, useLayoutEffect, useMemo, useRef } from 'react'

import { getMaterial, unitBox, unitCylinder } from '../materials'
import { signTexture, textTexture } from '../textures'
import { useZone } from '../zones'
import { BatchContext } from './batch'

/**
 * Map building blocks. Solid pieces add a Rapier collider, so they must be
 * rendered inside a `<RigidBody type="fixed" colliders={false}>` at the origin.
 */

/**
 * A Roblox "Part": a box with an optional collider and kill volume. Inside a
 * <StaticBatch> it is drawn as part of one merged mesh per material.
 */
export function Block({
  size,
  pos,
  rot,
  color = '#ffffff',
  pattern,
  tile = 1,
  emissive,
  emissiveIntensity,
  opacity,
  basic,
  solid = true,
  kill = false,
  shadow = true,
}) {
  const material = useMemo(
    () => getMaterial({ color, pattern, tile, emissive, emissiveIntensity, opacity, basic }),
    [color, pattern, tile, emissive, emissiveIntensity, opacity, basic],
  )
  const batch = useContext(BatchContext)
  const meshRef = useRef(null)
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!batch || !mesh) return undefined
    batch.add(mesh)
    return () => batch.remove(mesh)
  }, [batch])
  const shape = `${pos}|${size}|${rot}`
  useLayoutEffect(() => {
    batch?.touch()
  }, [batch, material, shape])
  useZone(
    () =>
      kill
        ? {
            kill: true,
            min: [pos[0] - size[0] / 2, pos[1] - size[1] / 2, pos[2] - size[2] / 2],
            max: [pos[0] + size[0] / 2, pos[1] + size[1] / 2 + 0.15, pos[2] + size[2] / 2],
          }
        : null,
    [kill, ...pos, ...size],
  )
  return (
    <>
      <mesh
        ref={meshRef}
        geometry={unitBox}
        material={material}
        position={pos}
        rotation={rot}
        scale={size}
        castShadow={shadow && !opacity && !(pos[1] < 0 && size[1] >= 4)}
        receiveShadow
      />
      {solid && <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={pos} rotation={rot} />}
    </>
  )
}

/** Vertical cylinder part (pedestals, pillars). Visual only unless `solid`. */
export function Cylinder({ pos, radius, height, color, emissive, emissiveIntensity, pattern, solid = false }) {
  const material = useMemo(
    () => getMaterial({ color, emissive, emissiveIntensity, pattern }),
    [color, emissive, emissiveIntensity, pattern],
  )
  return (
    <>
      <mesh geometry={unitCylinder} material={material} position={pos} scale={[radius * 2, height, radius * 2]} castShadow receiveShadow />
      {solid && <CuboidCollider args={[radius * 0.85, height / 2, radius * 0.85]} position={pos} />}
    </>
  )
}

/** A slope you can run up: one rotated box (visual + collider). Rises along -Z. */
export function Ramp({ x = 0, width, z0, y0, len, rise, color, pattern, tile = 2 }) {
  const angle = Math.atan2(rise, len)
  const hyp = Math.hypot(len, rise)
  const thick = 1
  // Top surface passes through (z0, y0) and (z0 - len, y0 + rise).
  const cz = z0 - len / 2 - (Math.sin(angle) * thick) / 2
  const cy = y0 + rise / 2 - (Math.cos(angle) * thick) / 2
  return <Block size={[width, thick, hyp + 0.4]} pos={[x, cy, cz]} rot={[angle, 0, 0]} color={color} pattern={pattern} tile={tile} />
}

/**
 * Camera-facing text, like a Roblox BillboardGui.
 * @param {{ lines: import('../textures').TextLine[], position: number[], height?: number }} props
 */
export function Label3D({ lines, position, height = 1, bob = 0 }) {
  const key = JSON.stringify(lines)
  const { texture, aspect } = useMemo(() => textTexture(lines), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef(null)
  const base = position[1]
  useFrame((state) => {
    if (bob && ref.current) ref.current.position.y = base + Math.sin(state.clock.elapsedTime * 2 + position[0]) * bob
  })
  return (
    <sprite ref={ref} position={position} scale={[height * aspect, height, 1]} renderOrder={4}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} fog={false} />
    </sprite>
  )
}

/**
 * A flat sign panel (SurfaceGui). `size` is [width, height] in metres; the canvas
 * resolution follows it so text stays crisp.
 */
export function Sign({ position, rotation = [0, 0, 0], size, options, emissive = 0.45 }) {
  const key = JSON.stringify(options)
  const texture = useMemo(
    () =>
      signTexture({
        width: Math.round(Math.min(2048, size[0] * 64)),
        height: Math.round(Math.min(1024, size[1] * 64)),
        ...options,
      }),
    [key, size[0], size[1]], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Two back-to-back faces, so the sign reads the right way round from both sides.
  return (
    <group position={position} rotation={rotation}>
      {[0, Math.PI].map((turn) => (
        <mesh key={turn} rotation={[0, turn, 0]}>
          <planeGeometry args={size} />
          <meshLambertMaterial
            map={texture}
            transparent
            emissive="#ffffff"
            emissiveMap={texture}
            emissiveIntensity={emissive}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-4}
          />
        </mesh>
      ))}
    </group>
  )
}
