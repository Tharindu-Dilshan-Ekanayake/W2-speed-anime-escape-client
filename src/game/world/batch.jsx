import { useFrame } from '@react-three/fiber'
import { createContext, useEffect, useMemo, useRef } from 'react'
import { Matrix4, Mesh } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Static batching for the map. Every wall, floor and trim is a Block - one
 * mesh, one draw call - so a stage was hundreds of draw calls. Blocks inside a
 * <StaticBatch> register here; the batch merges all of them that share a
 * material into a single mesh and hides the originals (colliders are separate
 * Rapier objects, so physics is untouched).
 *
 * Blocks never move, but they can change (an anime pad lights up when
 * equipped) or come and go; any of that marks the batch dirty and it is
 * rebuilt on the next frame.
 */
export const BatchContext = createContext(null)

const _local = new Matrix4()
const _inverse = new Matrix4()

export class Batcher {
  constructor() {
    this.meshes = new Set()
    this.merged = []
    this.dirty = false
  }

  add(mesh) {
    this.meshes.add(mesh)
    this.dirty = true
  }

  remove(mesh) {
    this.meshes.delete(mesh)
    mesh.visible = true
    this.dirty = true
  }

  /** A registered Block's material or transform changed. */
  touch() {
    this.dirty = true
  }

  clear(root) {
    for (const mesh of this.merged) {
      root?.remove(mesh)
      mesh.geometry.dispose()
    }
    this.merged = []
  }

  /** Merges the registered meshes, per material, under `root`. */
  rebuild(root) {
    this.clear(root)
    this.dirty = false
    root.updateWorldMatrix(true, true)
    _inverse.copy(root.matrixWorld).invert()

    const byMaterial = new Map()
    for (const mesh of this.meshes) {
      const list = byMaterial.get(mesh.material)
      if (list) list.push(mesh)
      else byMaterial.set(mesh.material, [mesh])
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) {
        // A lone mesh is drawn as it is (put it back if an earlier merge detached it).
        const m = meshes[0]
        if (!m.parent && m.userData.batchParent) m.userData.batchParent.add(m)
        m.visible = true
        continue
      }
      const parts = meshes.map((m) => m.geometry.clone().applyMatrix4(_local.multiplyMatrices(_inverse, m.matrixWorld)))
      const geometry = mergeGeometries(parts)
      for (const part of parts) part.dispose()
      if (!geometry) {
        for (const m of meshes) {
          if (!m.parent && m.userData.batchParent) m.userData.batchParent.add(m)
          m.visible = true
        }
        continue
      }
      const merged = new Mesh(geometry, material)
      merged.matrixAutoUpdate = false
      merged.castShadow = meshes.some((m) => m.castShadow)
      merged.receiveShadow = true
      root.add(merged)
      this.merged.push(merged)
      // The originals are no longer drawn. Take them out of the scene graph
      // altogether: thousands of hidden meshes still cost a matrix update and a
      // traversal every frame. (Their world matrix is kept: blocks never move.)
      for (const m of meshes) {
        m.visible = false
        if (m.parent) {
          m.userData.batchParent = m.parent
          m.removeFromParent()
        }
      }
    }
  }
}

/** Merges every Block rendered inside it into one mesh per material. */
export function StaticBatch({ children }) {
  const batcher = useMemo(() => new Batcher(), [])
  const root = useRef(null)
  useFrame(() => {
    if (batcher.dirty && root.current) batcher.rebuild(root.current)
  })
  useEffect(() => {
    const node = root.current
    return () => batcher.clear(node)
  }, [batcher])
  return (
    <BatchContext.Provider value={batcher}>
      <group ref={root}>{children}</group>
    </BatchContext.Provider>
  )
}
