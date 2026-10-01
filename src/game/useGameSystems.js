import { useEffect } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { startMultiplayer } from './multiplayer'
import './music'
import { setMuted } from './sfx'
import { useBoot } from './boot'
import { useGame } from './store'

/** After the SDK is ready with no account, wait this long for one to turn up before playing as a guest. */
const GUEST_GRACE_MS = 1200
/** If the SDK never answers at all, play on a local save after this long. */
const OFFLINE_AFTER_MS = 12000

/**
 * Background systems that live outside the 3D scene:
 *   - waits for Bloxity to say who is playing - the signed-in account, or a
 *     guest if there is none - and only then loads that player's save (the
 *     loading screen stays up until then). Accounts are signed in and out on
 *     Bloxity itself, never inside the game.
 *   - autosaves (throttled, and when the tab is hidden or closed)
 *   - announces the daily gift
 */
export function useGameSystems() {
  const { user, guest, status } = useBloxity()
  const id = user ? `u:${user.id ?? user.userId ?? user.username}` : guest ? `g:${guest.id ?? guest.username ?? 'guest'}` : null

  // Load the right save: the account's if there is one, else the guest's.
  useEffect(() => {
    const game = useGame.getState()
    if (user) {
      game.loadFor(id)
      return undefined
    }
    if (status === 'error') {
      game.loadFor('offline')
      return undefined
    }
    if (guest && status === 'ready') {
      // The SDK can report "no user" a moment before an account's details arrive.
      const timer = setTimeout(() => game.loadFor(id), GUEST_GRACE_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      if (!useGame.getState().loaded) useGame.getState().loadFor('offline')
    }, OFFLINE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [id, user, guest, status])

  // Apply the saved sound setting once a save is loaded.
  const loaded = useGame((s) => s.loaded)
  useEffect(() => {
    useBoot.setState({ label: loaded ? 'Loading your avatar…' : 'Signing in to Bloxity…' })
  }, [loaded])
  const saveKey = useGame((s) => s.saveKey)
  useEffect(() => {
    if (!loaded) return
    const s = useGame.getState()
    setMuted(!s.sound)
    s.toast('Welcome! Run to get faster 🏃', { icon: '👋', color: '#7ad8ff', ms: 3400 })
  }, [loaded, saveKey, user])

  // Multiplayer: join a lobby of up to 8 once a save is loaded. Silent - the
  // game just plays solo while the server can't be reached.
  useEffect(() => {
    if (!loaded) return undefined
    return startMultiplayer()
  }, [loaded])

  // Autosave.
  useEffect(() => {
    let timer = null
    const unsub = useGame.subscribe(() => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        useGame.getState().save()
      }, 1500)
    })
    const flush = () => useGame.getState().save()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      unsub()
      clearTimeout(timer)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // Tell the player when today's gift is waiting.
  useEffect(() => {
    if (!loaded) return
    if (useGame.getState().giftReady()) {
      useGame.getState().toast('Your DAILY gift is ready! 🎁', { icon: '🎁', color: '#ffe23a', ms: 3600 })
    }
  }, [loaded, saveKey])
}

export default useGameSystems
