// "What difficulty do you think it is?" picker, shared by the logging flow's
// completion step and the level page's edit-run modal — both ask the same
// question about the same field, so they render the same control.
//
// Five demon tiers as round face buttons, with the non-demon star values
// (AUTO..NINE_STAR) kept behind a labelled "Not demon-worthy" button: most
// non-demons logged here are still demons to someone, so that path stays
// secondary.

import {
  STAR_TO_OPINION as SHARED_STAR_TO_OPINION,
  NOT_DEMON_OPINION_VALUES,
} from '@infernolog/core'
import { cn } from '@/lib/utils'
import { difficultyFaceSrc, starCountToDifficulty } from '@/lib/gdAssets'
import type { DifficultyOpinion } from '@/lib/api/logging'

export const DEMON_OPINIONS: ReadonlyArray<{
  value: DifficultyOpinion
  label: string
  face: string
}> = [
  { value: 'EASY', label: 'Easy Demon', face: '/assets/gd/demon-easy.png' },
  {
    value: 'MEDIUM',
    label: 'Medium Demon',
    face: '/assets/gd/demon-medium.png',
  },
  { value: 'HARD', label: 'Hard Demon', face: '/assets/gd/demon-hard.png' },
  {
    value: 'INSANE',
    label: 'Insane Demon',
    face: '/assets/gd/demon-insane.png',
  },
  {
    value: 'EXTREME',
    label: 'Extreme Demon',
    face: '/assets/gd/demon-extreme.png',
  },
]

// The non-demon star values carry their own star count (1=AUTO..9=NINE_STAR)
// rather than a separate paired field — shared table, see
// packages/core/src/difficultyOpinion.ts.
export const STAR_TO_OPINION = SHARED_STAR_TO_OPINION as Record<
  number,
  DifficultyOpinion
>
export const NOT_DEMON_OPINIONS = new Set<DifficultyOpinion>(
  NOT_DEMON_OPINION_VALUES as DifficultyOpinion[]
)

export function DifficultyOpinionSelect({
  value,
  onChange,
}: {
  value: DifficultyOpinion | null
  onChange: (value: DifficultyOpinion) => void
}) {
  const notWorthy = value != null && NOT_DEMON_OPINIONS.has(value)
  return (
    <div className="space-y-3">
      {/* Demon difficulty faces — one row, evenly spaced across the width. */}
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

      {/* "Not demon-worthy" on its own row so it never wraps the face row. */}
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

      {/* Non-demon difficulty, by star count, shown when it's not demon-worthy. */}
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
