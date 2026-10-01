import { useEffect, useRef, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { MAX_LEVEL, secondsToMidnight, POTIONS, STAGES, stageLevel, walkDisplay, xpNeed } from '../game/config'
import { abbreviate, clock, withCommas } from '../game/format'
import { runtime } from '../game/runtime'
import { isMuted, setMuted, sfx } from '../game/sfx'
import { selectStepPreview, useGame } from '../game/store'

/**
 * The heads-up display. Layout (the top-left corner is left empty on purpose:
 * the host draws its logo there):
 *   left    rebirths + Wins, then the menu buttons
 *   right   the Bloxity profile (name, picture, log in / out), current stage,
 *           Adjust Speed, active potion
 *   bottom  "[E]" prompt, Speed, level bar, potion quick-buys
 *   centre  stage banners, level-up popups, the speed-trial tracker
 */

const click = () => sfx.click()

function SideButton({ icon, label, color, edge, onClick, badge, hotkey, className = '' }) {
  return (
    <button
      type="button"
      className={`gbtn side-btn ${className}`}
      style={{ '--bg': color, '--edge': edge }}
      onClick={() => {
        click()
        onClick()
      }}
    >
      <span className="ico">{icon}</span>
      <span className="lbl stroke-sm">{label}</span>
      {hotkey && <span className="keycap">{hotkey}</span>}
      {badge && <span className="badge">{badge}</span>}
    </button>
  )
}

const hhmm = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : clock(seconds)
}

/** Claims today's gift (the G key and the gift button). */
function claimDailyGift() {
  const game = useGame.getState()
  if (!game.giftReady()) {
    game.toast(`Next daily gift in ${hhmm(secondsToMidnight())} - come back tomorrow!`, { icon: '🎁', color: '#ffe23a' })
    return
  }
  const amount = game.claimGift()
  sfx.gift()
  runtime.celebrations += 1
  game.toast(`Daily gift: +${withCommas(amount)} Wins!`, { icon: '🎁', color: '#ffe23a', ms: 3200 })
}

function GiftButton() {
  useGame((s) => s.giftDay)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const ready = useGame.getState().giftReady()
  return (
    <SideButton
      icon="🎁"
      label={ready ? 'DAILY!' : hhmm(secondsToMidnight())}
      color="linear-gradient(180deg, #ffe86a, #ffb21f)"
      edge="#8a5a0a"
      className={ready ? 'gift-ready' : ''}
      badge={ready ? '!' : null}
      hotkey="G"
      onClick={claimDailyGift}
    />
  )
}

function LeftColumn() {
  const wins = useGame((s) => s.wins)
  const rebirths = useGame((s) => s.rebirths)
  const level = useGame((s) => s.level)
  const open = useGame((s) => s.openModal)
  return (
    <div className="left">
      <div className="stat">
        <span className="stat-icon"><span className="rebirth-ico">♻️</span></span>
        <span className="stat-value stroke">{withCommas(rebirths)}</span>
      </div>
      <div className="stat">
        <span className="stat-icon">🏆</span>
        <span className="stat-value stroke">{abbreviate(wins)}</span>
      </div>
      <div className="grid">
        <SideButton icon="🛒" label="Shop" color="linear-gradient(180deg, #ff6a9a, #e0205a)" edge="#7a0a2a" onClick={() => open('shop', { shopTab: 'animes' })} badge="OP!" hotkey="B" />
        <SideButton icon="🎒" label="Backpack" color="linear-gradient(180deg, #ffa84a, #ff6a1f)" edge="#8a3a0a" onClick={() => open('backpack')} hotkey="I" />
        <SideButton
          icon={<span className="rebirth-ico">♻️</span>}
          label="Rebirth"
          color="linear-gradient(180deg, #4fd8ff, #1f8aff)"
          edge="#0a4a9a"
          onClick={() => open('rebirth')}
          hotkey="R"
          badge={level >= MAX_LEVEL ? '!' : null}
        />
        <SideButton icon="🌀" label="Teleport" color="linear-gradient(180deg, #b47aff, #7a2aff)" edge="#3a0a8a" onClick={() => open('teleport')} hotkey="T" />
        <SideButton icon="🎮" label="Controls" color="linear-gradient(180deg, #7ae8a0, #1fb85a)" edge="#0a5a2a" onClick={() => open('controls')} hotkey="C" />
        <GiftButton />
      </div>
    </div>
  )
}

/** Who is playing: the Bloxity account the game loaded with, or a guest. */
function Profile() {
  const { identity, isLoggedIn } = useBloxity()
  const name = identity?.displayName || identity?.username || 'Guest'
  const pfp = identity?.pfp
  return (
    <div className="profile">
      {pfp ? <img className="pfp" src={pfp} alt="" /> : <div className="pfp">{name.charAt(0).toUpperCase()}</div>}
      <div>
        <div className="pname stroke-sm">{name}</div>
        <div className="psub">{isLoggedIn ? '✓ Bloxity account' : 'Playing as guest'}</div>
      </div>
    </div>
  )
}

function StageChip() {
  const zone = useGame((s) => s.zone)
  const level = useGame((s) => s.level)
  if (zone <= 0) return <div className="chip stroke-sm">🏠 Lobby</div>
  const stage = STAGES[zone - 1]
  return (
    <div className="chip stroke-sm">
      📍 Stage {zone} · {stage.name}
      <span style={{ color: level >= stageLevel(zone) ? '#7affc8' : '#ff8a8a' }}>(Lv {stageLevel(zone)})</span>
    </div>
  )
}

function AdjustSpeed() {
  const level = useGame((s) => s.level)
  const adjust = useGame((s) => s.adjust)
  const setAdjust = useGame((s) => s.setAdjust)
  const max = walkDisplay(level)
  const value = adjust ? Math.min(adjust, max) : max
  return (
    <div className="adjust">
      <button type="button" onClick={() => setAdjust(value - 2)} aria-label="Slower">
        −
      </button>
      <div>
        <div className="adjust-val stroke" style={{ color: value < max ? '#ffd23f' : '#fff' }}>
          {value}
        </div>
        <div className="adjust-lbl stroke-sm">✏️ Walk Speed{value < max ? ` (max ${max})` : ''}</div>
      </div>
      <button type="button" onClick={() => setAdjust(value + 2)} aria-label="Faster">
        +
      </button>
    </div>
  )
}

function PotionChip() {
  const potion = useGame((s) => s.potion)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  if (!potion || potion.until <= now) return null
  return (
    <div className="chip stroke-sm" style={{ borderColor: '#5fe86a' }}>
      🧪 {potion.mult}x Speed · {clock((potion.until - now) / 1000)}
    </div>
  )
}

function RightColumn() {
  return (
    <div className="right">
      <Profile />
      <StageChip />
      <AdjustSpeed />
      <PotionChip />
    </div>
  )
}

function Prompt() {
  const prompt = useGame((s) => s.prompt)
  const wins = useGame((s) => s.wins)
  if (!prompt) return null
  const afford = !prompt.cost || wins >= prompt.cost
  return (
    <div className="prompt" style={{ '--pc': prompt.color || '#ffd23f' }}>
      <span className="prompt-key">E</span>
      <span className="prompt-text stroke-sm">{prompt.text}</span>
      {prompt.cost > 0 && (
        <button
          type="button"
          className="gbtn prompt-go stroke-sm"
          style={afford ? { '--bg': 'linear-gradient(180deg, #5fe86a, #1fa83a)', '--edge': '#0a5a1a' } : { '--bg': 'linear-gradient(180deg, #8a8a9a, #5a5a6a)', '--edge': '#2a2a3a' }}
          onClick={() => runtime.promptAction?.()}
        >
          🏆 {abbreviate(prompt.cost)}
        </button>
      )}
      {!prompt.cost && runtime.promptAction && !prompt.text.includes('✓') && (
        <button type="button" className="gbtn prompt-go stroke-sm" onClick={() => runtime.promptAction?.()}>
          OK
        </button>
      )}
    </div>
  )
}

function SpeedAndLevel() {
  const speed = useGame((s) => s.speed)
  const level = useGame((s) => s.level)
  const xp = useGame((s) => s.xp)
  const step = useGame(selectStepPreview)
  const max = level >= MAX_LEVEL
  const need = max ? 1 : xpNeed(level)
  const pct = max ? 100 : Math.min(100, (xp / need) * 100)
  return (
    <>
      <div className="speed-text stroke">{abbreviate(speed)} Speed</div>
      <div className="speed-step stroke-sm">+{step} per step 👟</div>
      <div className="levelbar">
        <div className={`levelbar-fill ${max ? 'max' : ''}`} style={{ width: `${pct}%` }} />
        <div className="levelbar-text stroke">
          <span>Level: {level}</span>
          <span>{max ? <>MAX! Rebirth <span className="rebirth-ico">♻️</span></> : `${abbreviate(xp)}/${abbreviate(need)}`}</span>
        </div>
      </div>
    </>
  )
}

const POTION_STYLE = {
  p2: ['linear-gradient(180deg, #5fe86a, #1fa83a)', '#0a5a1a'],
  p3: ['linear-gradient(180deg, #4fd8ff, #1f6aff)', '#0a3a9a'],
  p5: ['linear-gradient(90deg, #ff5a8a, #ffd23f, #5fe86a, #4fd8ff, #c47bff)', '#5a1a6a'],
}

function Potions() {
  return (
    <div className="potions">
      {POTIONS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="gbtn potion-btn stroke-sm"
          style={{ '--bg': POTION_STYLE[p.id][0], '--edge': POTION_STYLE[p.id][1] }}
          onClick={() => {
            if (useGame.getState().buyPotion(p.id)) sfx.buy()
            else sfx.deny()
          }}
        >
          {p.icon} {p.mult}x Speed
          <span className="keycap">{POTIONS.indexOf(p) + 1}</span>
          <span className="potion-cost stroke-sm">🏆{abbreviate(p.cost)}</span>
        </button>
      ))}
    </div>
  )
}

function Bottom() {
  return (
    <div className="bottom">
      <Prompt />
      <SpeedAndLevel />
      <Potions />
    </div>
  )
}

function Toasts() {
  const toasts = useGame((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast stroke-sm" style={{ color: t.color }}>
          {t.icon} {t.text}
        </div>
      ))}
    </div>
  )
}

function Banner() {
  const banner = useGame((s) => s.banner)
  if (!banner) return null
  return (
    <div key={banner.key} className="banner">
      <div className="banner-slash" />
      <div className="banner-title stroke" style={{ color: banner.color }}>
        {banner.title}
      </div>
      {banner.sub && <div className="banner-sub stroke-sm">{banner.sub}</div>}
    </div>
  )
}

function LevelUp() {
  const levelUp = useGame((s) => s.levelUp)
  if (!levelUp) return null
  return (
    <div key={levelUp.key} className="levelup">
      <div className="levelup-title stroke">Level up! ({levelUp.level})</div>
      <div className="levelup-sub stroke">
        NEW WALKSPEED: {levelUp.from} &gt; {levelUp.to}
      </div>
      {levelUp.level >= MAX_LEVEL && <div className="levelup-sub stroke" style={{ color: '#ff8ad8' }}>MAX LEVEL - time to Rebirth! <span className="rebirth-ico">♻️</span></div>}
    </div>
  )
}

function TrialTracker() {
  const trial = useGame((s) => s.trialHud)
  if (!trial) return null
  const lead = Math.max(0, trial.lead)
  return (
    <div className="trial">
      <div className="trial-title stroke-sm">⚠️ {trial.name} — RUN! (Level {trial.level})</div>
      <div className="trial-track">
        <div className="trial-fill" style={{ width: `${trial.progress * 100}%` }} />
        <span className="trial-runner" style={{ left: `${trial.progress * 100}%` }}>
          🏃
        </span>
        <span className="trial-runner" style={{ left: '100%' }}>
          🏁
        </span>
      </div>
      <div className="trial-lead stroke-sm" style={{ color: lead < 4 ? '#ff6a6a' : lead < 8 ? '#ffd23f' : '#7affc8' }}>
        {lead < 4 ? 'IT\'S RIGHT BEHIND YOU!' : `${lead.toFixed(0)}m ahead`}
      </div>
    </div>
  )
}

function Death() {
  const dead = useGame((s) => s.dead)
  if (!dead) return null
  return (
    <div className="death">
      <div className="death-text stroke">💀 Respawning…</div>
    </div>
  )
}

/** Anime speed lines at the screen edge once the player is really moving. */
function SpeedLines() {
  const ref = useRef(null)
  useEffect(() => {
    let frame = 0
    let shown = 0
    const tick = () => {
      const target = Math.min(0.55, Math.max(0, (runtime.moveSpeed - 7) / 16))
      shown += (target - shown) * 0.1
      if (ref.current) {
        ref.current.style.opacity = shown.toFixed(3)
        ref.current.style.transform = `rotate(${(performance.now() / 40) % 360}deg)`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <div ref={ref} className="speed-lines" />
}

function Corner() {
  const music = useGame((s) => s.music)
  const [muted, setM] = useState(isMuted())
  return (
    <div className="corner-br">
      <button
        type="button"
        className="gbtn mini-btn"
        style={{ '--bg': music ? 'linear-gradient(180deg, #b47aff, #7a2aff)' : 'linear-gradient(180deg, #8a8a9a, #5a5a6a)', '--edge': '#2a0a5a' }}
        onClick={() => useGame.getState().setMusic(!music)}
        title="Music"
      >
        {music ? '🎵' : '🔇'}
      </button>
      <button
        type="button"
        className="gbtn mini-btn"
        style={{ '--bg': !muted ? 'linear-gradient(180deg, #4fd8ff, #1f8aff)' : 'linear-gradient(180deg, #8a8a9a, #5a5a6a)', '--edge': '#0a3a8a' }}
        onClick={() => {
          setMuted(!muted)
          setM(!muted)
          useGame.getState().setSound(muted)
        }}
        title="Sound"
      >
        {muted ? '🔈' : '🔊'}
      </button>
    </div>
  )
}

/** Hold to swing the camera, like the A / D keys. */
function TurnButton({ dir, label }) {
  const set = (v) => () => {
    runtime.buttonTurn = v
  }
  return (
    <button
      type="button"
      className="gbtn turn-btn stroke-sm"
      style={{ '--bg': 'linear-gradient(180deg, #ffd86a, #ff9a1f)', '--edge': '#8a4a0a' }}
      onPointerDown={set(dir)}
      onPointerUp={set(0)}
      onPointerLeave={set(0)}
      onPointerCancel={set(0)}
      title={dir < 0 ? 'Turn camera left (A)' : 'Turn camera right (D)'}
    >
      {label}
    </button>
  )
}

function TurnButtons() {
  return (
    <div className="turn-btns">
      <TurnButton dir={-1} label="🔄 A" />
      <TurnButton dir={1} label="D 🔃" />
    </div>
  )
}

/** Keyboard shortcuts for the menu buttons (B, I, R, T, C, G) and the potions (1, 2, 3). */
const MENU_KEYS = { KeyB: ['shop', { shopTab: 'animes' }], KeyI: ['backpack'], KeyR: ['rebirth'], KeyT: ['teleport'], KeyC: ['controls'] }
function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable) return
      const game = useGame.getState()
      const menu = MENU_KEYS[e.code]
      if (menu) {
        if (game.modal === menu[0]) game.closeModal()
        else game.openModal(menu[0], menu[1] || {})
        sfx.click()
      } else if (e.code === 'KeyG') {
        claimDailyGift()
      } else if (e.code.startsWith('Digit') && POTIONS[Number(e.code.slice(5)) - 1]) {
        if (game.buyPotion(POTIONS[Number(e.code.slice(5)) - 1].id)) sfx.buy()
        else sfx.deny()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function HUD() {
  useShortcuts()
  return (
    <div className="hud">
      <SpeedLines />
      <LeftColumn />
      <RightColumn />
      <TrialTracker />
      <Toasts />
      <Banner />
      <LevelUp />
      <Bottom />
      <Corner />
      <TurnButtons />
      <Death />
    </div>
  )
}

export default HUD
