const UNITS = ['K', 'M', 'B', 'T', 'Qd', 'Qn', 'Sx']

/**
 * Roblox-simulator style number abbreviation, matching the original HUD:
 * 642 -> "642", 1100 -> "1.1K", 2000 -> "2.0K", 15000 -> "15K".
 */
export function abbreviate(value) {
  const n = Math.floor(Number(value) || 0)
  if (Math.abs(n) < 1000) return String(n)
  let v = n
  let i = -1
  while (Math.abs(v) >= 1000 && i < UNITS.length - 1) {
    v /= 1000
    i += 1
  }
  const shown = Math.abs(v) < 10 ? (Math.floor(v * 10) / 10).toFixed(1) : String(Math.floor(v))
  return shown + UNITS[i]
}

/** The ANIME stand's labels use a lowercase k ("+1k Speed", "2k Wins Required"). */
export const abbreviateLower = (value) => abbreviate(value).replace('K', 'k')

/** 1234567 -> "1,234,567" */
export const withCommas = (value) => Math.floor(Number(value) || 0).toLocaleString('en-US')

/** 754 -> "12:34" */
export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
