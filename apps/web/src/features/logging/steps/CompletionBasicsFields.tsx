// The three composite controls the completion step is built from. Their
// option tables and asset paths live in useCompletionBasicsStep.

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import type { Level } from '@/lib/api/logging'
import { FieldHint, FieldLabel } from '../components'
import {
  coinSrc,
  coinUncollectedSrc,
  isOfficialLevel,
} from './useCompletionBasicsStep'

export function CoinsSection({
  level,
  collected,
  onChange,
}: {
  level: Level
  collected: number
  onChange: (bitmask: number) => void
}) {
  const count = level.coins ?? 0
  const isOfficial = isOfficialLevel(level)
  const collectedSrc = coinSrc(level)

  return (
    <div className="space-y-3">
      <FieldLabel htmlFor="c-attempts">Coins</FieldLabel>
      <div className="flex gap-3">
        {Array.from({ length: count }, (_, i) => {
          const bit = 1 << i
          const isCollected = (collected & bit) !== 0
          return (
            <button
              key={i}
              type="button"
              aria-label={`Coin ${i + 1} ${isCollected ? '(collected)' : '(not collected)'}`}
              aria-pressed={isCollected}
              onClick={() => onChange(collected ^ bit)}
              className="group flex flex-col items-center gap-1"
            >
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-full border transition-all',
                  isCollected
                    ? 'border-transparent bg-transparent'
                    : 'border-border bg-bg-elevated/50 opacity-40 grayscale'
                )}
              >
                <img
                  src={isCollected ? collectedSrc : coinUncollectedSrc()}
                  alt=""
                  className={cn(
                    'size-7 drop-shadow transition-all',
                    !isCollected && 'opacity-60',
                    // Unverified user coins: tint silver→bronze via CSS filter
                    !isOfficial && !level.coinsVerified && isCollected
                      ? '[filter:sepia(0.6)_saturate(2)_hue-rotate(-20deg)]'
                      : ''
                  )}
                />
              </div>
              <span className="text-[10px] text-text-tertiary">
                {isCollected ? 'Got it' : `Coin ${i + 1}`}
              </span>
            </button>
          )
        })}
      </div>
      <FieldHint>Click a coin to mark it as collected.</FieldHint>
    </div>
  )
}

export function TwoPlayerSection({
  solo,
  partner,
  onSoloChange,
  onPartnerChange,
}: {
  solo: boolean | null
  partner: string
  onSoloChange: (v: boolean) => void
  onPartnerChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <FieldLabel htmlFor="c-attempts">2-Player</FieldLabel>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-pressed={solo === true}
          onClick={() => onSoloChange(true)}
          className={cn(
            'rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
            solo === true
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
          )}
        >
          Beat it solo
        </button>
        <button
          type="button"
          aria-pressed={solo === false}
          onClick={() => onSoloChange(false)}
          className={cn(
            'rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
            solo === false
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
          )}
        >
          With a partner
        </button>
      </div>
      {solo === false && (
        <div>
          <FieldLabel htmlFor="c-partner">Partner</FieldLabel>
          <Input
            id="c-partner"
            value={partner}
            onChange={(e) => onPartnerChange(e.target.value)}
            placeholder="Partner's name (optional)"
            maxLength={100}
          />
        </div>
      )}
    </div>
  )
}
