import { RigidBody } from '@react-three/rapier'
import { memo, useMemo, useRef } from 'react'

import AnimeCharacter from '../AnimeCharacter'
import { ANIMES, FLUID_Y, TREADMILLS } from '../config'
import { abbreviate } from '../format'
import { GlowColumn, RisingSparks, RuneRing } from '../fx/Glow'
import { LOBBY, LOBBY_GATE_Z, stageWidth } from '../layout'
import { sfx } from '../sfx'
import { useGame } from '../store'
import { spawnStarTexture } from '../textures'
import { themeOf } from '../themes'
import { useZone } from '../zones'
import { StaticBatch } from './batch'
import { Fluid } from './Fluid'
import { Gate } from './Gate'
import { Treadmill } from './Pads'
import { Block, Label3D, Sign } from './Primitives'
import Scenery from './Scenery'

/**
 * The hub: spawn, a row of treadmills, the anime gallery (walk up to one to buy
 * or wear it), the boots shop, the rebirth altar and the teleport portal. Stage 1
 * starts straight ahead (-Z).
 */

const theme = themeOf('lobby')
const { maxZ, minZ, halfW } = LOBBY
const MID_Z = (maxZ + minZ) / 2
const LEN = maxZ - minZ

/** Opens a menu when stepped into (once per visit). */
function MenuPad({ pos, size = [6, 6], modal, extra, color, label, icon }) {
  const [x, y, z] = pos
  useZone(
    () => ({
      min: [x - size[0] / 2, y - 1, z - size[1] / 2],
      max: [x + size[0] / 2, y + 3, z + size[1] / 2],
      onEnter: () => {
        sfx.click()
        useGame.getState().openModal(modal, extra)
      },
    }),
    [x, y, z, modal],
  )
  return (
    <>
      <RuneRing position={[x, y, z]} radius={Math.max(size[0], size[1]) / 2} color={color} />
      <Label3D position={[x, y + 2.2, z]} height={0.9} bob={0.15} lines={[{ text: `${icon} ${label}`, size: 52, color }]} />
    </>
  )
}

function SpawnPad() {
  const texture = useMemo(() => spawnStarTexture(), [])
  return (
    <>
      <Block size={[13, 0.3, 13]} pos={[0, 0.05, 30]} color="#eceaf7" pattern="studs" />
      <mesh position={[0, 0.22, 30]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshLambertMaterial map={texture} />
      </mesh>
    </>
  )
}

/** One anime on its pedestal, with the buy / wear pad in front. */
function AnimeStand({ anime, x, z, side, near }) {
  const owned = useGame((s) => s.ownedAnimes.includes(anime.id))
  const equipped = useGame((s) => s.equipped === anime.id)
  const padX = x - side * 5
  useZone(
    () => ({
      min: [padX - 2, -1, z - 2],
      max: [padX + 2, 3, z + 2],
      prompt: () => {
        const s = useGame.getState()
        if (s.equipped === anime.id) return { text: `${anime.name} equipped ✓`, color: anime.aura.color }
        if (s.ownedAnimes.includes(anime.id)) return { text: `Wear ${anime.name}`, color: anime.aura.color }
        return { text: `Buy ${anime.name} · ${anime.title}`, cost: anime.cost, color: anime.aura.color }
      },
      action: () => {
        const s = useGame.getState()
        if (s.equipped === anime.id) return
        if (s.buyAnime(anime.id)) sfx.transform()
        else sfx.deny()
      },
    }),
    [anime.id, padX, z],
  )
  const color = anime.aura.color
  return (
    <group>
      <Block size={[4.4, 1.2, 4.4]} pos={[x, 0.6, z]} color="#2a2a3a" pattern="studs" />
      <Block size={[4.6, 0.2, 4.6]} pos={[x, 1.25, z]} color={color} emissive={color} emissiveIntensity={equipped ? 1 : 0.45} solid={false} />
      {near && <AnimeCharacter look={anime.look} position={[x, 1.35, z]} rotation={[0, -side * (Math.PI / 2), 0]} idleOffset={x + z} />}
      {(owned || equipped) && <GlowColumn position={[x, 1.3, z]} radius={1.6} height={4} color={color} opacity={equipped ? 0.6 : 0.3} />}
      <RuneRing position={[padX, 0, z]} radius={1.8} color={color} opacity={0.75} />
      <Label3D
        position={[x, 4.9, z]}
        height={1.25}
        lines={[
          { text: `${anime.icon} ${anime.name}`, size: 52, color },
          { text: equipped ? 'EQUIPPED' : owned ? 'OWNED' : `🏆 ${abbreviate(anime.cost)}`, size: 40, color: owned ? '#7affc8' : '#ffd23f' },
        ]}
      />
    </group>
  )
}

function Treadmills() {
  const owned = useGame((s) => s.ownedTreadmills)
  return TREADMILLS.map((t, i) => {
    const x = (i - (TREADMILLS.length - 1) / 2) * 10
    return (
      <Treadmill
        key={t.id}
        pos={[x, 0, 66]}
        mult={t.mult}
        color={t.color}
        accent={t.accent}
        fx={t.fx}
        rainbow={t.rainbow}
        cost={t.cost}
        owned={owned.includes(t.id)}
        isOwned={() => useGame.getState().ownedTreadmills.includes(t.id)}
        onBuy={() => (useGame.getState().buyTreadmill(t.id) ? sfx.buy() : sfx.deny())}
        face={1}
      />
    )
  })
}

function ShopStall({ near }) {
  return (
    <group>
      <Block size={[12, 1.4, 3]} pos={[-18, 0.7, 12]} color="#8a5a3a" pattern="planks" />
      {[-1, 1].map((s) => (
        <Block key={s} size={[0.6, 6, 0.6]} pos={[-18 + s * 5.6, 3, 12.6]} color="#6a4a2a" solid={false} />
      ))}
      {/* Striped awning. */}
      {Array.from({ length: 8 }, (_, k) => (
        <Block key={k} size={[1.5, 0.4, 5]} pos={[-18 - 5.25 + k * 1.5, 6.2, 12]} rot={[0.25, 0, 0]} color={k % 2 ? '#ffffff' : '#2fc8a0'} solid={false} />
      ))}
      <Sign
        position={[-18, 8.6, 12.4]}
        size={[10, 2.6]}
        options={{ bg: '#3a3a4a', border: '#ffd23f', borderWidth: 10, lines: [{ text: '👟 SHOP', size: 120, color: '#ffffff', stroke: '#000', strokeWidth: 12 }] }}
      />
      {near && <AnimeCharacter look={ANIMES[1].look} position={[-18, 0, 14.4]} rotation={[0, Math.PI, 0]} />}
      {/* Boots on display on the counter. */}
      {['#ff3b4a', '#39d353', '#1fb8ff', '#ffd23f'].map((c, k) => (
        <Block key={c} size={[0.8, 0.6, 1.2]} pos={[-21 + k * 2, 1.7, 11.6]} color={c} emissive={c} emissiveIntensity={0.3} solid={false} />
      ))}
      <MenuPad pos={[-18, 0, 6]} modal="shop" extra={{ shopTab: 'boots' }} color="#2fc8a0" label="Boots & Potions" icon="🛒" />
    </group>
  )
}

function RebirthAltar() {
  return (
    <group>
      <Block size={[10, 1, 10]} pos={[18, 0.5, 12]} color="#ffffff" pattern="studs" />
      <Block size={[3, 6, 3]} pos={[18, 4, 14]} color="#ff4a7a" pattern="bricks" />
      <mesh position={[18, 9, 14]} rotation={[0, 0, 0]}>
        <torusGeometry args={[2.6, 0.45, 12, 40]} />
        <meshBasicMaterial color="#ff6aa0" toneMapped={false} />
      </mesh>
      <GlowColumn position={[18, 1, 12]} radius={4.5} height={10} color="#ff6aa0" opacity={0.35} />
      <RisingSparks position={[18, 1, 12]} radius={4} height={10} count={50} color="#ffb3d0" size={4} />
      <Sign
        position={[18, 13.2, 14]}
        size={[10, 2.6]}
        options={{ bg: '#4a0a2a', bg2: '#c81a5a', border: '#ffd23f', borderWidth: 10, lines: [{ text: '♻️ REBIRTH', size: 110, color: '#ffffff', stroke: '#000', strokeWidth: 12, hue: 212 }] }}
      />
      <MenuPad pos={[18, 1, 7.5]} size={[5, 4]} modal="rebirth" color="#ff4a5a" label="Rebirth" icon="🔴" />
    </group>
  )
}

function TeleportPortal() {
  const ring = useRef(null)
  return (
    <group>
      <Block size={[10, 1, 10]} pos={[18, 0.5, 46]} color="#2a2a3a" pattern="studs" />
      <mesh ref={ring} position={[18, 5.5, 48]}>
        <torusGeometry args={[3.6, 0.6, 12, 48]} />
        <meshLambertMaterial color="#8a4bff" emissive="#8a4bff" emissiveIntensity={0.9} />
      </mesh>
      <RuneRing position={[18, 5.5, 48.05]} radius={3.4} color="#c47bff" spin={1.6} />
      <GlowColumn position={[18, 1, 46]} radius={4.5} height={9} color="#a46bff" opacity={0.35} />
      <Sign
        position={[18, 11.4, 48]}
        size={[10, 2.6]}
        options={{ bg: '#1a0a4a', bg2: '#6a2aff', border: '#7af0ff', borderWidth: 10, lines: [{ text: '🌀 TELEPORT', size: 104, color: '#ffffff', stroke: '#000', strokeWidth: 12 }] }}
      />
      <MenuPad pos={[18, 1, 43]} size={[5, 4]} modal="teleport" color="#c47bff" label="Teleport" icon="🌀" />
    </group>
  )
}

function HowToBoard() {
  return (
    <Sign
      position={[-18, 5.5, 47]}
      rotation={[0, 0.25, 0]}
      size={[14, 8]}
      options={{
        bg: '#0a2a5a',
        bg2: '#1a6aff',
        border: '#ffd23f',
        borderWidth: 14,
        studs: true,
        lines: [
          { text: 'HOW TO PLAY', size: 90, color: '#ffe23a', stroke: '#000', strokeWidth: 10 },
          { text: '🏃 Every step = more Speed', size: 46, color: '#ffffff', stroke: '#000', strokeWidth: 6 },
          { text: '⭐ Speed levels you up (max 20)', size: 46, color: '#ffffff', stroke: '#000', strokeWidth: 6 },
          { text: '🔒 Stage N needs Level N', size: 46, color: '#ffffff', stroke: '#000', strokeWidth: 6 },
          { text: '🏆 Win pads pay Wins - spend them!', size: 46, color: '#ffffff', stroke: '#000', strokeWidth: 6 },
          { text: '♻️ Level 20? Rebirth for more!', size: 46, color: '#ffffff', stroke: '#000', strokeWidth: 6, hue: 212 },
        ],
      }}
    />
  )
}

/** `near`: the player is in or next to the lobby, so its characters are built and animated. */
export const Lobby = memo(function Lobby({ near = true }) {
  const half = Math.ceil(ANIMES.length / 2)
  return (
    <group>
      <StaticBatch>
        <RigidBody type="fixed" colliders={false}>
          <Block size={[halfW * 2, 6, LEN]} pos={[0, -3, MID_Z]} color="#8fe36b" pattern="studs" />
          <Block size={[16, 0.08, LEN]} pos={[0, 0.03, MID_Z]} color="#aab4ff" pattern="diamond" solid={false} shadow={false} />
          {/* Hedges round the edge, open toward stage 1. */}
          {[-1, 1].map((s) => (
            <Block key={s} size={[2, 1.6, LEN]} pos={[s * (halfW - 1), 0.8, MID_Z]} color="#3aa83a" pattern="studs" />
          ))}
          <Block size={[halfW * 2, 1.6, 2]} pos={[0, 0.8, maxZ - 1]} color="#3aa83a" pattern="studs" />
          {/* The stage 1 gate, set into the lobby's far wall. */}
          <Gate n={1} z={LOBBY_GATE_Z} width={stageWidth(1)} facade={halfW * 2} theme={themeOf('sakura')} />

          <SpawnPad />
          <Treadmills />
          <ShopStall near={near} />
          <RebirthAltar />
          <TeleportPortal />
          <HowToBoard />

          {ANIMES.map((anime, i) => {
            const side = i < half ? -1 : 1
            const k = i < half ? i : i - half
            return <AnimeStand key={anime.id} anime={anime} x={side * (halfW - 7)} z={58 - k * 6.2} side={side} near={near} />
          })}
        </RigidBody>
      </StaticBatch>

      <Sign
        position={[0, 9.5, 74]}
        rotation={[0, Math.PI, 0]}
        size={[30, 5]}
        options={{
          bg: '#0a2a5a',
          bg2: '#1a8aff',
          border: '#ffd23f',
          borderWidth: 16,
          anime: { burst: '#ffd23f' },
          lines: [
            { text: 'TREADMILLS', size: 140, color: '#ffffff', stroke: '#000', strokeWidth: 14 },
            { text: 'Increase your Speed automatically!', size: 64, color: '#ffe23a', stroke: '#000', strokeWidth: 8 },
          ],
        }}
      />
      {[-1, 1].map((s) => (
        <Label3D key={s} position={[s * (halfW - 7), 9, 32]} height={2.4} lines={[{ text: '✨ ANIMES ✨', size: 80, gradient: ['#ffffff', '#ffd23f', '#ff7ab0'] }]} />
      ))}

      <Fluid kind="water" area={[-420, 420, minZ - 2, maxZ + 260]} y={FLUID_Y} />
      <Scenery theme={theme} z0={maxZ + 140} z1={minZ} width={halfW * 2} seed={3} />
    </group>
  )
})

export default Lobby
