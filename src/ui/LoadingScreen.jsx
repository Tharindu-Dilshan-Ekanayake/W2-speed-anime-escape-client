import { useEffect, useRef, useState } from 'react'

import { BOOT_STEPS, bootStep, useBoot } from '../game/boot'
import { fontsReady } from '../game/textures'

const MILESTONES = Object.values(BOOT_STEPS).sort((a, b) => a - b)
const CREEP = 6
const FADE_MS = 700

const PETALS = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 47) % 100,
  delay: (i % 9) * 0.7,
  duration: 6 + (i % 5) * 1.3,
  size: 1.6 + (i % 4) * 0.6,
  icon: ['🌸', '⭐', '✨', '⚡'][i % 4],
}))

const RUNNERS = ['🍃', '⭐', '⚡', '❄️', '🔥', '🌸', '🌊', '🦊', '🌙', '🐲']

const TIPS = [
  'Every step makes you faster - just keep running!',
  'Stage N needs Level N. Train on the treadmills to level up fast.',
  'Press Space twice to do a double-jump flip!',
  'A/D turns the camera - hold W and steer.',
  'Speed trials chase you! Run flat out at the stage level.',
  'The green win pad pays 2x once you own 350K Wins.',
  'Boots add Speed to every single step.',
  'Reached Level 20? Rebirth for a permanent Speed boost!',
  'Every anime has its own aura and glowing footprints.',
]

/**
 * The anime-style loading screen. Follows the real start-up milestones (boot.js),
 * glides between them, then fades away.
 */
export function LoadingScreen() {
  const label = useBoot((s) => s.label)
  const [phase, setPhase] = useState('loading')
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const fillRef = useRef(null)
  const pctRef = useRef(null)

  useEffect(() => {
    fontsReady.then(() => bootStep('fonts', 'Building the escape…'))
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let soft = 0
    let shown = 0
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { target } = useBoot.getState()
      const next = MILESTONES.find((m) => m > target) ?? 100
      soft = Math.max(soft, target)
      if (target < 100) soft = Math.min(next - 2, soft + CREEP * dt)
      shown += (soft - shown) * Math.min(1, dt * 4)
      if (target >= 100 && soft - shown < 0.6) shown = 100
      const pct = Math.min(100, shown)
      if (fillRef.current) fillRef.current.style.width = `${pct}%`
      if (pctRef.current) pctRef.current.textContent = `${Math.floor(pct)}%`
      if (pct >= 100) {
        setPhase('fading')
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (phase !== 'fading') return undefined
    const id = setTimeout(() => setPhase('gone'), FADE_MS + 250)
    return () => clearTimeout(id)
  }, [phase])

  if (phase === 'gone') return null
  return (
    <div className={`loader ${phase === 'fading' ? 'loader-out' : ''}`} aria-busy={phase === 'loading'}>
      <div className="loader-rays" />
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="loader-petal"
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, fontSize: `calc(var(--u) * ${p.size})` }}
        >
          {p.icon}
        </span>
      ))}
      <div className="loader-center">
        <div className="loader-kicker stroke-sm">+1 SPEED</div>
        <h1 className="loader-title">ANIME ESCAPE</h1>
        <div className="loader-jp">アニメ・エスケープ</div>
        <div className="loader-anime">
          {RUNNERS.map((r, i) => (
            <span key={r} style={{ animationDelay: `${i * 0.12}s` }}>
              {r}
            </span>
          ))}
        </div>
        <div className="loader-bar">
          <div ref={fillRef} className="loader-fill">
            <span className="loader-runner">🏃</span>
          </div>
        </div>
        <div className="loader-status">
          <span ref={pctRef} className="loader-pct stroke-sm">
            0%
          </span>
          <span>{label}</span>
        </div>
      </div>
      <div className="loader-tip">💡 {tip}</div>
    </div>
  )
}

export default LoadingScreen
