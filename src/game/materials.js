import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
} from 'three'

import { patternTexture } from './textures'

/**
 * Shared geometry and material caches. The map is built from thousands of boxes;
 * one unit box geometry and deduplicated materials keep GPU memory and draw-call
 * setup small.
 *
 * Patterned materials map their texture in *world space* (a cheap tri-planar
 * projection picked by the face normal), so a stud or brick is the same size on
 * every block whatever its scale - and blocks of any size can share, and be
 * batched into, one material.
 */

export const unitBox = new BoxGeometry(1, 1, 1)
export const unitCone = new ConeGeometry(0.5, 1, 16)
export const unitCone4 = new ConeGeometry(0.5, 1, 4)
export const unitCylinder = new CylinderGeometry(0.5, 0.5, 1, 20)
export const unitSphere = new SphereGeometry(0.5, 20, 14)
export const unitOcta = new OctahedronGeometry(0.5, 0)

const materials = new Map()

/** Patterns that carry their own colour and glow (the material stays white). */
const SELF_COLOURED = new Set(['lava', 'acid', 'ice', 'crystal', 'crate'])

/** World-space UVs: one texture repeat per `tile` metres. */
function worldUV(material, tile) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = { value: 1 / tile }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTile;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          vec4 wp = vec4(position, 1.0);
          vec3 wn = normal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            wn = mat3(instanceMatrix) * wn;
          #endif
          wp = modelMatrix * wp;
          wn = abs(normalize(mat3(modelMatrix) * wn));
          vec2 tuv = wn.y > 0.6 ? wp.xz : (wn.x > wn.z ? wp.zy : wp.xy);
          #ifdef USE_MAP
            vMapUv = tuv * uTile;
          #endif
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv = tuv * uTile;
          #endif
        }`,
      )
  }
  // `tile` is a uniform, so every tile size shares one compiled program.
  material.customProgramCacheKey = () => 'worldUV'
}

/**
 * @param {{ color?: string, pattern?: string, tile?: number, emissive?: string,
 *   emissiveIntensity?: number, opacity?: number, basic?: boolean }} opts
 */
export function getMaterial({
  color = '#ffffff',
  pattern,
  tile = 1,
  emissive,
  emissiveIntensity = 1,
  opacity = 1,
  basic = false,
} = {}) {
  const key = [color, pattern, pattern ? tile : '', emissive, emissiveIntensity, opacity, basic].join('|')
  if (materials.has(key)) return materials.get(key)

  const map = pattern ? patternTexture(pattern) : null
  const selfColoured = pattern && SELF_COLOURED.has(pattern)
  const transparent = opacity < 1

  let material
  if (basic) {
    material = new MeshBasicMaterial({ color, map, transparent, opacity, toneMapped: false })
  } else {
    // Lambert rather than PBR: the same blocky matte look, far cheaper per pixel.
    material = new MeshLambertMaterial({ color: selfColoured ? '#ffffff' : color, map, transparent, opacity })
    if (emissive) {
      material.emissive = new Color(emissive)
      material.emissiveIntensity = emissiveIntensity
      if (selfColoured) material.emissiveMap = map
    }
  }
  if (map) worldUV(material, tile)
  if (transparent) material.depthWrite = false
  materials.set(key, material)
  return material
}
