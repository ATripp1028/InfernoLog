// The user-coin toggle grid, shared by the completion-logging step and the
// edit-level modal. Both surfaces store the same thing — a bitmask where bit
// `i` means "collected coin i+1" — and both had grown their own copy of the
// bitmask arithmetic, the official-vs-user sprite choice, and the
// unverified-coin bronze tint. The two visual treatments survive as `variant`.

import { cn } from '@/lib/utils'
import {
  collectedCoinSrc,
  isOfficialLevel,
  uncollectedCoinSrc,
} from '@/lib/gdAssets'

/** The level fields the coin sprites are chosen from. */
export interface CoinPickerLevel {
  coins: number | null
  coinsVerified: boolean | null
  creator: string | null
}

/**
 * A row of toggle buttons, one per coin the level has, backed by a bitmask.
 *
 * Renders nothing when the level has no coins, so callers can mount it
 * unconditionally.
 *
 * @param collected - Bitmask of collected coins; bit `i` is coin `i + 1`.
 * @param onChange - Receives the whole new bitmask, not the toggled index.
 * @param variant - `framed` gives each coin a circular well (the logging
 * flow's denser step layout); `bare` renders the sprite alone (the edit
 * modal). Cosmetic only.
 */
export function CoinPicker({
  level,
  collected,
  onChange,
  variant = 'bare',
}: {
  level: CoinPickerLevel
  collected: number
  onChange: (bitmask: number) => void
  variant?: 'framed' | 'bare'
}) {
  const count = level.coins ?? 0
  if (count <= 0) return null

  // Unverified user coins are the silver sprite tinted bronze — matching how
  // GD itself shows coins on a level whose coins were never silver-verified.
  const unverifiedTint =
    !isOfficialLevel(level) && !level.coinsVerified
      ? '[filter:sepia(0.6)_saturate(2)_hue-rotate(-20deg)]'
      : ''
  const src = collectedCoinSrc(level)

  return (
    <div className="flex gap-3">
      {Array.from({ length: count }, (_, i) => {
        const bit = 1 << i
        const isCollected = (collected & bit) !== 0
        const image = (
          <img
            src={isCollected ? src : uncollectedCoinSrc}
            alt=""
            className={cn(
              'size-7 drop-shadow transition-all',
              !isCollected &&
                (variant === 'framed' ? 'opacity-60' : 'opacity-40 grayscale'),
              isCollected && unverifiedTint
            )}
          />
        )
        return (
          <button
            key={i}
            type="button"
            aria-label={`Coin ${i + 1} ${isCollected ? '(collected)' : '(not collected)'}`}
            aria-pressed={isCollected}
            onClick={() => onChange(collected ^ bit)}
            className="flex flex-col items-center gap-1"
          >
            {variant === 'framed' ? (
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-full border transition-all',
                  isCollected
                    ? 'border-transparent bg-transparent'
                    : 'border-border bg-bg-elevated/50 opacity-40 grayscale'
                )}
              >
                {image}
              </div>
            ) : (
              image
            )}
            <span className="text-[10px] text-text-tertiary">
              {isCollected ? 'Got it' : `Coin ${i + 1}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
