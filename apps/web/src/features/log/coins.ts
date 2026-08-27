import { isOfficialLevel, officialCoinSrc, userCoinSrc } from '@/lib/gdAssets'
import type { LogItem } from './types'

/** Which coin sprite a list row shows, and how many of it. */
export interface CoinDisplay {
  count: number
  src: string
}

/**
 * The coin indicator for a list row, or `null` when the level has no coins.
 *
 * Coin count comes from the level data — the API fills in 3 for the main
 * levels / Meltdown / SubZero, 0 for World. Official levels render the gold
 * secret-coin sprite; user levels the silver-or-uncollected user-coin sprite,
 * which doubles as the "are these coins silver-verified?" signal.
 */
export function coinDisplay(level: LogItem['level']): CoinDisplay | null {
  const count = level.coins ?? 0
  if (count <= 0) return null
  return {
    count,
    src: isOfficialLevel(level)
      ? officialCoinSrc
      : userCoinSrc(level.coinsVerified),
  }
}
