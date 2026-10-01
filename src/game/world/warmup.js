import { Mesh, Scene } from 'three'

import { getMaterial, unitBox } from '../materials'
import { patternTexture } from '../textures'
import { auraMaterialsForWarmUp } from '../fx/Aura'
import { fluidMaterial } from './Fluid'

/**
 * Builds and compiles everything a stage needs the first time it is seen, while
 * the loading screen is still up: every surface pattern (texture drawn and
 * uploaded to the GPU), every fluid shader, and each material variant. Without
 * this the first visit to each new theme compiled shaders mid-run, and the game
 * stuttered at the gate.
 */
const PATTERNS = ['studs', 'lmarks', 'bricks', 'checker', 'diamond', 'crate', 'planks', 'roof', 'belt', 'lava', 'acid', 'ice', 'crystal']
const FLUIDS = ['water', 'lava', 'acid', 'void', 'candy', 'cloud', 'quicksand']

/**
 * Compiles every shader the scene as it stands now will need - including the
 * parts that are hidden until something happens (level-up bursts, "+N" popups,
 * a stage's tornadoes) - without blocking: the driver compiles in parallel.
 * Run it after the world has loaded and again after each stage finishes
 * mounting, so no shader is ever first compiled in the middle of a run.
 */
export function precompileScene(gl, scene, camera) {
  const hidden = []
  scene.traverse((o) => {
    if (!o.visible) {
      o.visible = true
      hidden.push(o)
    }
  })
  try {
    if (gl.compileAsync) gl.compileAsync(scene, camera).catch(() => {})
    else gl.compile(scene, camera)
  } catch (err) {
    console.warn('[game] precompile skipped', err)
  }
  for (const o of hidden) o.visible = false
}

export function warmUp(gl, camera) {
  try {
    const scene = new Scene()
    const add = (material) => {
      const mesh = new Mesh(unitBox, material)
      mesh.position.set(0, 0, -5)
      mesh.scale.setScalar(0.01)
      scene.add(mesh)
    }
    for (const kind of PATTERNS) {
      const texture = patternTexture(kind)
      gl.initTexture(texture)
      add(getMaterial({ color: '#ffffff', pattern: kind }))
      add(getMaterial({ color: '#ffffff', pattern: kind, emissive: '#ffffff' }))
    }
    add(getMaterial({ color: '#ffffff' }))
    add(getMaterial({ color: '#ffffff', emissive: '#ffffff' }))
    add(getMaterial({ color: '#ffffff', basic: true }))
    add(getMaterial({ color: '#ffffff', opacity: 0.5 }))
    for (const kind of FLUIDS) add(fluidMaterial(kind))
    for (const material of auraMaterialsForWarmUp()) add(material)
    gl.compile(scene, camera)
  } catch (err) {
    console.warn('[game] warm-up skipped', err)
  }
}
