import { Canvas, useFrame } from '@react-three/fiber'
import { Fragment, useEffect, useMemo, useRef } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import AnimeCharacter from '../game/AnimeCharacter'
import {
  ANIMES,
  AVATAR,
  AVATAR_ID,
  BOOTS,
  characterById,
  MAX_LEVEL,
  POTIONS,
  rebirthSpeedMult,
  rebirthWinsMult,
  STAGES,
  stageLevel,
  stageWins,
  stepGain,
  teleportCost,
  TREADMILLS,
  walkDisplay,
} from '../game/config'
import { abbreviate, withCommas } from '../game/format'
import Aura from '../game/fx/Aura'
import { GlowClock } from '../game/fx/Glow'
import { teleportToStage } from '../game/gameplay'
import { runtime } from '../game/runtime'
import { sfx } from '../game/sfx'
import { selectStepPreview, useGame } from '../game/store'
import { themeOf } from '../game/themes'

/** Menus: Shop, Backpack, Rebirth, Teleport, Controls. */

const FX_NAMES = {
  dust: 'Dust Trail',
  wind: 'Wind Slashes',
  stars: 'Star Shower',
  thunder: 'Thunder Storm',
  frost: 'Frost Flakes',
  flame: 'Fire Trail',
  sakura: 'Sakura Petals',
  shadow: 'Shadow Smoke',
  water: 'Water Splash',
  toxic: 'Toxic Bubbles',
  electric: 'Cyber Sparks',
  moon: 'Moonlight',
  aura: 'Golden Aura',
  butterfly: 'Butterflies',
  crow: 'Crow Feathers',
  monarch: 'Void Flames',
  rainbow: 'Rainbow Hearts',
  galaxy: 'Galaxy Dust',
  divine: 'Divine Fire',
}
const PRINT_NAMES = { shoe: 'Shoe prints', star: 'Stars', bolt: 'Lightning bolts', flake: 'Snowflakes', flame: 'Flames', flower: 'Flowers', drop: 'Water drops', paw: 'Paw prints', moon: 'Moons', heart: 'Hearts' }

function Modal({ icon, title, children, wide }) {
  const close = useGame((s) => s.closeModal)
  return (
    <div
      className="modal-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="modal" style={wide ? { width: 'min(calc(var(--u) * 132), 96vw)' } : undefined}>
        <div className="modal-head">
          <span className="modal-icon">{icon}</span>
          <span className="modal-title stroke">{title}</span>
          <button
            type="button"
            className="gbtn modal-close stroke-sm"
            onClick={() => {
              sfx.click()
              close()
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

const IDLE = { current: { speed: 0 } }

function Spin({ children }) {
  const ref = useRef(null)
  useFrame((_s, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.7
  })
  return <group ref={ref}>{children}</group>
}

function AnimePreview({ anime }) {
  return (
    <Canvas camera={{ position: [0, 1.4, 4.6], fov: 34 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
      <GlowClock />
      <ambientLight intensity={1.4} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <group position={[0, -0.95, 0]}>
        <Spin>
          <AnimeCharacter look={anime.look} />
          <Aura character={anime} motionRef={IDLE} />
        </Spin>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <circleGeometry args={[1.3, 32]} />
          <meshBasicMaterial color={anime.aura.color} transparent opacity={0.35} />
        </mesh>
      </group>
    </Canvas>
  )
}

function AvatarPreview() {
  const { identity } = useBloxity()
  return (
    <div className="preview-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {identity?.pfp ? (
        <img src={identity.pfp} alt="" style={{ width: '70%', borderRadius: '50%', border: '6px solid #ffd23f' }} />
      ) : (
        <span style={{ fontSize: 'calc(var(--u) * 16)' }}>🧑</span>
      )}
    </div>
  )
}

function AnimesTab() {
  const owned = useGame((s) => s.ownedAnimes)
  const equipped = useGame((s) => s.equipped)
  const pick = useGame((s) => s.shopPick) || equipped
  const wins = useGame((s) => s.wins)
  const sel = characterById(pick)
  const isOwned = owned.includes(sel.id)
  const isEq = equipped === sel.id
  const list = [AVATAR, ...ANIMES]
  const c1 = sel.aura?.color || '#4fb8ff'

  const act = () => {
    const game = useGame.getState()
    if (isEq) return
    if (isOwned) {
      game.equipAnime(sel.id)
      sfx.transform()
      return
    }
    if (game.buyAnime(sel.id)) sfx.transform()
    else sfx.deny()
  }

  return (
    <div className="shop-wrap">
      <div className="cards">
        {list.map((a) => {
          const own = owned.includes(a.id)
          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              className={`card ${pick === a.id ? 'sel' : ''} ${own ? '' : 'locked'}`}
              style={{ '--c1': a.aura?.color || '#4fb8ff', '--c2': '#14162a' }}
              onClick={() => {
                sfx.click()
                useGame.setState({ shopPick: a.id })
              }}
            >
              {equipped === a.id ? <span className="card-tag eq">WEARING</span> : own ? <span className="card-tag">OWNED</span> : null}
              <div className="card-ico">{a.icon}</div>
              <div className="card-name stroke-sm">{a.name}</div>
              <div className="card-sub">{a.title}</div>
              {!own && <div className="card-price stroke-sm">🏆 {abbreviate(a.cost)}</div>}
            </div>
          )
        })}
      </div>
      <div className="preview" style={{ '--c1': c1 }}>
        <div className="preview-canvas">{sel.id === AVATAR_ID ? <AvatarPreview /> : <AnimePreview anime={sel} />}</div>
        <div className="preview-name stroke">
          {sel.icon} {sel.name}
        </div>
        <div className="preview-title stroke-sm">{sel.title}</div>
        <div className="preview-info">
          <b>Effect</b>
          <span>{FX_NAMES[sel.fx?.kind] || 'Dust Trail'}</span>
          <b>Footprints</b>
          <span style={{ color: sel.print?.color }}>{PRINT_NAMES[sel.print?.shape] || 'Shoe prints'}</span>
          <b>Aura</b>
          <span>{sel.aura ? `${'★'.repeat(sel.aura.tier)}${'☆'.repeat(5 - sel.aura.tier)}` : 'None'}</span>
          <b>Speed</b>
          <span>Same for everyone - level up!</span>
        </div>
        <button
          type="button"
          className={`gbtn buy-btn stroke-sm ${isEq ? 'done' : isOwned ? 'equip' : ''}`}
          disabled={!isOwned && wins < sel.cost}
          onClick={act}
        >
          {isEq ? '✓ Wearing' : isOwned ? 'Wear' : `Buy · 🏆 ${abbreviate(sel.cost)}`}
        </button>
      </div>
    </div>
  )
}

function BootsTab() {
  const owned = useGame((s) => s.ownedBoots)
  const boots = useGame((s) => s.boots)
  const level = useGame((s) => s.level)
  return (
    <div className="row-list">
      {BOOTS.map((b) => {
        const own = owned.includes(b.id)
        const on = boots === b.id
        return (
          <div key={b.id} className="row-item" style={{ '--c1': b.glow, '--c2': '#14162a' }}>
            <div className="row-ico">👟</div>
            <div className="row-main">
              <div className="row-name stroke-sm">{b.name}</div>
              <div className="row-sub">
                +{b.bonus} Speed every step · at Level {level}: +{stepGain(level) + b.bonus} per step
              </div>
            </div>
            <button
              type="button"
              className={`gbtn row-btn stroke-sm ${on ? 'done' : own ? 'equip' : ''}`}
              onClick={() => (useGame.getState().buyBoots(b.id) ? sfx.buy() : sfx.deny())}
            >
              {on ? '✓ Wearing' : own ? 'Wear' : `🏆 ${abbreviate(b.cost)}`}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function PotionsTab() {
  return (
    <div className="row-list">
      {POTIONS.map((p) => (
        <div key={p.id} className="row-item" style={{ '--c1': p.color, '--c2': '#14162a' }}>
          <div className="row-ico">{p.icon}</div>
          <div className="row-main">
            <div className="row-name stroke-sm">{p.name}</div>
            <div className="row-sub">All Speed gained x{p.mult} for {p.seconds / 60} minutes (same potion stacks time)</div>
          </div>
          <button type="button" className="gbtn row-btn stroke-sm" onClick={() => (useGame.getState().buyPotion(p.id) ? sfx.buy() : sfx.deny())}>
            🏆 {abbreviate(p.cost)}
          </button>
        </div>
      ))}
    </div>
  )
}

function TreadmillsTab() {
  const owned = useGame((s) => s.ownedTreadmills)
  return (
    <div className="row-list">
      {TREADMILLS.map((t) => {
        const own = owned.includes(t.id)
        return (
          <div key={t.id} className="row-item" style={{ '--c1': t.rainbow ? '#c47bff' : t.color, '--c2': '#14162a' }}>
            <div className="row-ico">🏃</div>
            <div className="row-main">
              <div className="row-name stroke-sm">x{t.mult} Treadmill</div>
              <div className="row-sub">In the lobby. Stand on it to gain {t.mult}x Speed automatically.</div>
            </div>
            <button
              type="button"
              className={`gbtn row-btn stroke-sm ${own ? 'done' : ''}`}
              onClick={() => (own ? null : useGame.getState().buyTreadmill(t.id) ? sfx.buy() : sfx.deny())}
            >
              {own ? '✓ Unlocked' : `🏆 ${abbreviate(t.cost)}`}
            </button>
          </div>
        )
      })}
    </div>
  )
}

const TABS = [
  ['animes', '🦊 Animes', AnimesTab],
  ['boots', '👟 Boots', BootsTab],
  ['potions', '🧪 Potions', PotionsTab],
  ['treadmills', '🏃 Treadmills', TreadmillsTab],
]

function Shop() {
  const tab = useGame((s) => s.shopTab)
  const wins = useGame((s) => s.wins)
  const Tab = (TABS.find((t) => t[0] === tab) || TABS[0])[2]
  return (
    <Modal icon="🛒" title={`Shop · 🏆 ${abbreviate(wins)}`} wide>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`gbtn tab stroke-sm ${tab === id ? 'on' : ''}`}
            onClick={() => {
              sfx.click()
              useGame.setState({ shopTab: id })
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="modal-body">
        <Tab />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Backpack: what you own, and your stats.
// ---------------------------------------------------------------------------

function Backpack() {
  const s = useGame()
  const step = selectStepPreview(s)
  const owned = [AVATAR, ...ANIMES].filter((a) => s.ownedAnimes.includes(a.id))
  const boots = BOOTS.filter((b) => s.ownedBoots.includes(b.id))
  const stats = [
    ['Level', `${s.level} / ${MAX_LEVEL}`],
    ['Walk speed', walkDisplay(s.level)],
    ['Speed per step', `+${step}`],
    ['Rebirths', `${s.rebirths} (x${rebirthSpeedMult(s.rebirths)} Speed)`],
    ['Total Speed', abbreviate(s.speed)],
    ['Wins', withCommas(s.wins)],
    ['Best stage', s.bestStage || '-'],
    ['Wins earned', abbreviate(s.stats.winsEarned)],
  ]
  return (
    <Modal icon="🎒" title="Backpack" wide>
      <div className="modal-body">
        <div className="stats-grid">
          {stats.map(([k, v]) => (
            <div key={k} className="stat-card">
              <div className="k">{k}</div>
              <div className="v stroke-sm">{v}</div>
            </div>
          ))}
        </div>
        <div className="section-title stroke-sm">🦊 Characters ({owned.length}/{ANIMES.length + 1})</div>
        <div className="cards">
          {owned.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              className={`card ${s.equipped === a.id ? 'sel' : ''}`}
              style={{ '--c1': a.aura?.color || '#4fb8ff', '--c2': '#14162a' }}
              onClick={() => {
                if (s.equipped === a.id) return
                useGame.getState().equipAnime(a.id)
                sfx.transform()
              }}
            >
              {s.equipped === a.id && <span className="card-tag eq">WEARING</span>}
              <div className="card-ico">{a.icon}</div>
              <div className="card-name stroke-sm">{a.name}</div>
              <div className="card-sub">{a.title}</div>
            </div>
          ))}
        </div>
        <div className="section-title stroke-sm">👟 Boots</div>
        {boots.length === 0 ? (
          <div className="row-sub">No boots yet - grab some in the Shop!</div>
        ) : (
          <div className="cards">
            {boots.map((b) => (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                className={`card ${s.boots === b.id ? 'sel' : ''}`}
                style={{ '--c1': b.glow, '--c2': '#14162a' }}
                onClick={() => {
                  useGame.getState().buyBoots(b.id)
                  sfx.click()
                }}
              >
                {s.boots === b.id && <span className="card-tag eq">WEARING</span>}
                <div className="card-ico">👟</div>
                <div className="card-name stroke-sm">{b.name}</div>
                <div className="card-sub">+{b.bonus} per step</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Rebirth
// ---------------------------------------------------------------------------

function Rebirth() {
  const level = useGame((s) => s.level)
  const rebirths = useGame((s) => s.rebirths)
  const ready = level >= MAX_LEVEL
  return (
    <Modal icon={<span className="rebirth-ico">♻️</span>} title="Rebirth">
      <div className="modal-body">
        <div className="rb-grid">
          <div className="rb-head stroke-sm">Before</div>
          <div />
          <div className="rb-head stroke-sm">After</div>
          <div className="rb-box stroke">{rebirthSpeedMult(rebirths).toFixed(1)}x Speed</div>
          <div className="rb-arrow">➡️</div>
          <div className="rb-box stroke">{rebirthSpeedMult(rebirths + 1).toFixed(1)}x Speed</div>
          <div className="rb-box win stroke">{rebirthWinsMult(rebirths).toFixed(2)}x Wins</div>
          <div className="rb-arrow">➡️</div>
          <div className="rb-box win stroke">{rebirthWinsMult(rebirths + 1).toFixed(2)}x Wins</div>
          <div className="rb-box lvl stroke">Level {level}</div>
          <div className="rb-arrow">➡️</div>
          <div className="rb-box lvl stroke">Level 1</div>
        </div>
        <div className="rb-warn stroke-sm">Rebirth resets your level and Speed! Wins, animes and boots are kept.</div>
        <div className="rb-bar">
          <div className="rb-fill" style={{ width: `${(level / MAX_LEVEL) * 100}%` }} />
          <div className="rb-text stroke">
            Level {level}/{MAX_LEVEL}
          </div>
        </div>
        <button
          type="button"
          className="gbtn buy-btn stroke"
          disabled={!ready}
          onClick={() => {
            const game = useGame.getState()
            if (!game.rebirth()) return
            sfx.rebirth()
            runtime.levelUps += 1
            runtime.celebrations += 1
            game.closeModal()
            game.showBanner('REBIRTH!', `x${rebirthSpeedMult(game.rebirths).toFixed(1)} Speed · Level 1 again`, '#ff8ad8')
            teleportToStage(0, { force: true })
          }}
        >
          {ready ? (
            <>
              <span className="rebirth-ico">♻️</span> REBIRTH NOW
            </>
          ) : (
            `Reach Level ${MAX_LEVEL} to Rebirth`
          )}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Teleport
// ---------------------------------------------------------------------------

function Teleport() {
  const level = useGame((s) => s.level)
  const zone = useGame((s) => s.zone)
  const rebirths = useGame((s) => s.rebirths)
  const wins = useGame((s) => s.wins)
  return (
    <Modal icon="🌀" title={`Teleport · 🏆 ${abbreviate(wins)}`} wide>
      <div className="modal-body">
        <div className="tp-grid">
          <button type="button" className={`tp-tile ${zone === 0 ? 'here' : ''}`} style={{ '--c1': '#4fb8ff', '--c2': '#1a3a8a' }} onClick={() => teleportToStage(0, { force: true })}>
            <div className="tp-num stroke">🏠</div>
            <div className="tp-name stroke-sm">LOBBY</div>
            <div className="tp-req stroke-sm">Shop · Treadmills</div>
            <div className="tp-fee stroke-sm" style={{ color: '#7affc8' }}>Free</div>
          </button>
          {STAGES.map((stage, i) => {
            const n = i + 1
            const need = stageLevel(n)
            const locked = level < need
            const theme = themeOf(stage.theme)
            return (
              <button
                key={n}
                type="button"
                className={`tp-tile ${locked ? 'locked' : ''} ${zone === n ? 'here' : ''}`}
                style={{ '--c1': theme.accent, '--c2': theme.sky[0] }}
                onClick={() => teleportToStage(n)}
              >
                {locked && <span className="tp-lock">🔒</span>}
                <div className="tp-num stroke">{n}</div>
                <div className="tp-name stroke-sm">{stage.name}</div>
                <div className="tp-req stroke-sm">
                  Lv {need} · 🏆 +{abbreviate(Math.round(stageWins(n) * rebirthWinsMult(rebirths)))}
                </div>
                <div className="tp-fee stroke-sm" style={{ color: wins >= teleportCost(n) ? '#7affc8' : '#ff8a8a' }}>
                  Teleport: 🏆 {abbreviate(teleportCost(n))}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const KEY_ROWS = [
  [['W', 'S'], 'Run forward / back'],
  [['A', 'D'], 'Turn the camera (steer)'],
  [['Space'], 'Jump · press again in the air for a double-jump flip'],
  [['E'], 'Buy / wear / unlock what you stand on'],
  [['Right-drag'], 'Look around · mouse wheel zooms'],
  [['B'], 'Shop'],
  [['I'], 'Backpack'],
  [['R'], 'Rebirth'],
  [['T'], 'Teleport'],
  [['G'], 'Daily gift'],
  [['C'], 'This controls list'],
  [['1', '2', '3'], 'Buy a 2x / 3x / 5x Speed potion'],
  [['Esc'], 'Close a menu'],
]

function Controls() {
  return (
    <Modal icon="🎮" title="Controls">
      <div className="modal-body">
        <div className="keys">
          {KEY_ROWS.map(([keys, text]) => (
            <Fragment key={text}>
              <span>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span>{text}</span>
            </Fragment>
          ))}
        </div>
      </div>
    </Modal>
  )
}

const MODALS = { shop: Shop, backpack: Backpack, rebirth: Rebirth, teleport: Teleport, controls: Controls }

export function Modals() {
  const modal = useGame((s) => s.modal)
  const close = useGame((s) => s.closeModal)
  useEffect(() => {
    if (!modal) return undefined
    const onKey = (e) => {
      if (e.code === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, close])
  const Component = useMemo(() => MODALS[modal], [modal])
  if (!Component) return null
  return (
    <div className="hud" style={{ zIndex: 20 }}>
      <Component />
    </div>
  )
}

export default Modals
