// Presentational pieces shared between EditRunModal (ProgressUpdate-scoped
// fields) and EditLevelModal (LevelProgress-scoped fields) — split out so
// neither modal duplicates the other's form chrome.
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { StepperInput } from '@/components/ui/stepper-input'
import { difficultyFaceSrc, starCountToDifficulty } from '@/lib/gdAssets'
import { displayMax } from '@/features/logging/format'
import type { RatingDisplayScale } from '@/lib/api/me'
import {
  STAR_TO_OPINION as SHARED_STAR_TO_OPINION,
  NOT_DEMON_OPINION_VALUES,
} from '@infernolog/core'
import { getZonedParts } from '@/lib/timezone'
import type { LevelMeta } from './types'

// Serialized ISO date (+ optional IANA zone it was entered in) → the date/time
// input values that pre-populate a DateTimeField. When a zone is present, the
// date is derived in THAT zone rather than sliced from raw UTC — an entry
// logged at 11:58 PM America/New_York is already the next day in UTC, so a
// naive slice would show the wrong calendar date back to the user.
export function zonedDateTimeInput(
  iso: string | null,
  timezone: string | null
): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  if (!timezone) return { date: (iso as string).slice(0, 10), time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const { year, month, day, hour, minute } = getZonedParts(d, timezone)
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return { date, time }
}

export function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      {children}
    </div>
  )
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm text-text-secondary"
    >
      {children}
    </Label>
  )
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea
      {...props}
      className="flex min-h-[80px] w-full rounded-md border border-input bg-bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
    />
  )
}

// ─── Rating row (slider + stepper) ────────────────────────────────

export function RatingRow({
  label,
  sublabel,
  value,
  scale,
  onChange,
}: {
  label: string
  sublabel?: string
  value: number | null
  scale: RatingDisplayScale
  onChange: (display: number) => void
}) {
  const max = displayMax(scale)
  const isTen = scale === 'ZERO_TO_TEN'
  const display = value ?? 0
  return (
    <div className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center sm:gap-4">
      <div className="sm:w-24 sm:shrink-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {sublabel && <p className="text-xs text-text-tertiary">{sublabel}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:contents">
        <Slider
          className="w-full sm:flex-1"
          min={0}
          max={max}
          step={isTen ? 0.1 : 1}
          value={[display]}
          onValueChange={(vals) => onChange(vals[0] ?? 0)}
        />
        <StepperInput
          value={display}
          onChange={onChange}
          min={0}
          max={max}
          precision={isTen ? 1 : 0}
          deltas={isTen ? [0.5, 1] : [5, 10]}
          aria-label={label}
          className="w-full sm:w-auto"
          inputClassName="min-w-0 flex-1 sm:w-12 sm:flex-none"
        />
      </div>
    </div>
  )
}

// ─── Difficulty opinion picker ─────────────────────────────────────

export type DifficultyOpinion =
  | 'EASY'
  | 'MEDIUM'
  | 'HARD'
  | 'INSANE'
  | 'EXTREME'
  | 'AUTO'
  | 'TWO_STAR'
  | 'THREE_STAR'
  | 'FOUR_STAR'
  | 'FIVE_STAR'
  | 'SIX_STAR'
  | 'SEVEN_STAR'
  | 'EIGHT_STAR'
  | 'NINE_STAR'

const DEMON_OPINIONS = [
  {
    value: 'EASY' as const,
    label: 'Easy Demon',
    face: '/assets/gd/demon-easy.png',
  },
  {
    value: 'MEDIUM' as const,
    label: 'Medium Demon',
    face: '/assets/gd/demon-medium.png',
  },
  {
    value: 'HARD' as const,
    label: 'Hard Demon',
    face: '/assets/gd/demon-hard.png',
  },
  {
    value: 'INSANE' as const,
    label: 'Insane Demon',
    face: '/assets/gd/demon-insane.png',
  },
  {
    value: 'EXTREME' as const,
    label: 'Extreme Demon',
    face: '/assets/gd/demon-extreme.png',
  },
]

// The non-demon star values carry their own star count (1=AUTO..9=NINE_STAR)
// rather than a separate paired field — shared table, see
// packages/core/src/difficultyOpinion.ts.
const STAR_TO_OPINION = SHARED_STAR_TO_OPINION as Record<
  number,
  DifficultyOpinion
>
const NOT_DEMON_OPINIONS = new Set<DifficultyOpinion>(
  NOT_DEMON_OPINION_VALUES as DifficultyOpinion[]
)

export function DifficultyOpinionSelect({
  value,
  onChange,
}: {
  value: DifficultyOpinion | null
  onChange: (v: DifficultyOpinion) => void
}) {
  const notWorthy = value != null && NOT_DEMON_OPINIONS.has(value)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 justify-items-center gap-2">
        {DEMON_OPINIONS.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex size-12 items-center justify-center rounded-full border transition-all',
                active
                  ? 'border-primary bg-primary/20 ring-2 ring-primary'
                  : 'border-border bg-bg-elevated/50 hover:bg-bg-elevated/80'
              )}
            >
              <img src={opt.face} alt="" className="size-8" />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-pressed={notWorthy}
        onClick={() => onChange(STAR_TO_OPINION[1]!)}
        className={cn(
          'h-10 w-full rounded-md border px-4 text-sm font-medium transition-colors',
          notWorthy
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
        )}
      >
        Not demon-worthy
      </button>

      {notWorthy && (
        <div>
          <p className="mb-1.5 text-xs text-text-tertiary">
            What difficulty would you give it?
          </p>
          <div className="grid grid-cols-5 justify-items-center gap-2 sm:grid-cols-9">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
              const active = value === STAR_TO_OPINION[n]
              const difficulty = starCountToDifficulty(n)
              return (
                <button
                  key={n}
                  type="button"
                  title={`${n}★ · ${difficulty}`}
                  aria-label={`${n} star ${difficulty}`}
                  aria-pressed={active}
                  onClick={() => onChange(STAR_TO_OPINION[n]!)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md border px-2 py-1 transition-all',
                    active
                      ? 'border-primary bg-primary/15 ring-1 ring-primary'
                      : 'border-border bg-bg-surface/60 hover:bg-bg-elevated/60'
                  )}
                >
                  <img
                    src={difficultyFaceSrc(difficulty)}
                    alt=""
                    className="size-6"
                  />
                  <span className="text-[10px] font-medium text-text-secondary">
                    {n}★
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Coins ────────────────────────────────────────────────────────

export function EditCoinsSection({
  level,
  collected,
  onChange,
}: {
  level: LevelMeta
  collected: number
  onChange: (bitmask: number) => void
}) {
  const count = level.coins ?? 0
  const isOfficial = level.officialSongId != null
  const collectedSrc = isOfficial
    ? '/assets/gd/coin-official.png'
    : '/assets/gd/coin-user.png'

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        Coins
      </p>
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
              className="flex flex-col items-center gap-1"
            >
              <img
                src={
                  isCollected ? collectedSrc : '/assets/gd/coin-uncollected.png'
                }
                alt=""
                className={cn(
                  'size-7 drop-shadow transition-all',
                  !isCollected && 'opacity-40 grayscale',
                  !isOfficial && !level.coinsVerified && isCollected
                    ? '[filter:sepia(0.6)_saturate(2)_hue-rotate(-20deg)]'
                    : ''
                )}
              />
              <span className="text-[10px] text-text-tertiary">
                {isCollected ? 'Got it' : `Coin ${i + 1}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 2-Player ─────────────────────────────────────────────────────

export function EditTwoPlayerSection({
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
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        2-Player
      </p>
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
          <Label className="mb-1.5 block text-sm text-text-secondary">
            Partner
          </Label>
          <Input
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
