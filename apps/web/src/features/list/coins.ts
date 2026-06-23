import { officialCoinSrc, userCoinSrc } from '@/lib/gdAssets'
import type { ListItem } from './types'

export interface CoinDisplay {
  count: number
  src: string
}

// Coin count comes from the level data (the API fills in 3 for the main levels /
// Meltdown / SubZero, 0 for World). Official levels (RobTop) render the gold
// secret-coin sprite; user levels use the silver/uncollected user-coin sprite.
export function coinDisplay(level: ListItem['level']): CoinDisplay | null {
  const count = level.coins ?? 0
  if (count <= 0) return null
  const isOfficial = level.creator?.toLowerCase() === 'robtop'
  return {
    count,
    src: isOfficial ? officialCoinSrc : userCoinSrc(level.coinsVerified),
  }
}
