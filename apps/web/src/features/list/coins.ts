import { officialCoinSrc, userCoinSrc } from '@/lib/gdAssets'
import type { ListItem } from './types'

// The 22 main-game official levels (in-game IDs 1–22). RobTop's main levels all
// carry 3 gold secret coins, but the level cache doesn't store them — so we
// render them at display time using the official sprite. Spinoff / GD World
// levels are intentionally excluded (they get their stored user-coin data).
const MAIN_LEVEL_IDS = new Set(
  Array.from({ length: 22 }, (_, i) => String(i + 1))
)

export interface CoinDisplay {
  count: number
  src: string
}

export function coinDisplay(level: ListItem['level']): CoinDisplay | null {
  if (MAIN_LEVEL_IDS.has(level.inGameId)) {
    return { count: 3, src: officialCoinSrc }
  }
  const count = level.coins ?? 0
  if (count <= 0) return null
  return { count, src: userCoinSrc(level.coinsVerified) }
}
