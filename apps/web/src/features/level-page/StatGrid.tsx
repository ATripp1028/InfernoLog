import { HelpCircle } from 'lucide-react'
import { computeOverallRating } from '@infernolog/core'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/numberFormat'
import { formatRating } from '@/lib/ratingScale'
import {
  opinionDifficulty,
  opinionShortLabel,
} from '@/lib/difficultyOpinionLabel'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import type { RatingCategory } from '@/lib/api/me'
import type {
  RatingMode,
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import type { LevelPageData } from '@/lib/api/levelPage'
import { formatEntryDate } from './timelineFormat'

interface StatBoxProps {
  label: string
  value: React.ReactNode
  variant: StatGridVariant
}

function StatBox({ label, value, variant }: StatBoxProps) {
  const isMobile = variant === 'mobile'
  return (
    <div
      className={cn(
        'rounded-card border',
        isMobile
          ? 'border-white/[0.12] bg-white/5 px-3 py-2'
          : 'border-border bg-bg-surface px-3.5 py-3'
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div
        className={cn(
          'mt-1.5 font-medium text-text-primary',
          isMobile ? 'text-sm' : 'text-base'
        )}
      >
        {value}
      </div>
    </div>
  )
}

/**
 * Which of the level page's two layouts is rendering the grid. Not a
 * breakpoint: the page mounts one layout or the other (see `useWideLayout`),
 * and a `md:` class here would style the mobile grid as the desktop one on a
 * phone held in landscape — including the `px-0` that assumes the enclosing
 * card supplies the padding.
 */
export type StatGridVariant = 'mobile' | 'desktop'

interface StatGridProps {
  data: LevelPageData
  datePref: DateFormatPreference
  scale: RatingDisplayScale
  // Widened for MANUAL, where computeOverallRating returns null and the RATING
  // cell falls back to its own blank. Showing the level's manual POSITION here
  // instead is a display concern, and belongs with the rest of the MANUAL
  // display work rather than with the schema.
  ratingMode: RatingMode
  includeEnjoyment: boolean
  enjoymentWeight: number
  ratingCategories: RatingCategory[]
  variant?: StatGridVariant
}

/**
 * The level page's headline stats: attempts, ratings, worst fail, and the rest.
 */
export function StatGrid({
  data,
  datePref,
  scale,
  ratingMode,
  includeEnjoyment,
  enjoymentWeight,
  ratingCategories,
  variant = 'mobile',
}: StatGridProps) {
  const { progressUpdates, rankPosition, worstFail } = data

  const completion = progressUpdates.find((u) => u.kind === 'COMPLETION')
  // For a DROPPED level this is the drop itself — drops are ordinary
  // progress_updates now, so no special-casing is needed here.
  const latestUpdate = progressUpdates[0]

  // DATE: completion date → most recent update date → last-updated.
  // Shares Timeline's formatter rather than a second copy of it — this used
  // to be a local `getDateDisplay` that was the same function with the
  // arguments packed differently.
  const dated = completion ?? latestUpdate
  const {
    text: dateText,
    timeText,
    zoneSuffix,
    uncertain,
  } = formatEntryDate(
    dated?.date ?? null,
    dated?.dateTimezone ?? null,
    data.updatedAt,
    dated?.dateUncertain ?? false,
    datePref
  )

  // ATTEMPTS: completion → latest update (the drop, if dropped) → null
  const attempts = completion?.attempts ?? latestUpdate?.attempts ?? null

  // RATING — computed overall rating (weighted avg or simple per user mode),
  // shown separately from enjoyment. GDDL tier has its own stat box. Rating
  // lives on LevelProgress (one current value per level), independent of
  // completion status — so this is computed regardless of whether a
  // completion exists, matching the list view (apps/api/src/routes/progress.ts).
  const categoryWeights = new Map(
    ratingCategories.map((cat) => [cat.id, cat.weight])
  )
  const overallRating = computeOverallRating(
    { ratingMode, includeEnjoyment, enjoymentWeight, categoryWeights },
    {
      simpleRating: data.simpleRating,
      enjoyment: (completion ?? latestUpdate)?.enjoyment ?? null,
      ratingScores: data.ratingScores,
    }
  )
  const ratingDisplay =
    overallRating != null ? formatRating(overallRating, scale) : '—'

  // ENJOYMENT — separate from the rating
  const enjoymentDisplay =
    completion?.enjoyment != null
      ? formatRating(completion.enjoyment, scale)
      : '—'

  // WORST FAIL
  const worstFailDisplay = worstFail != null ? `${worstFail}%` : '—'

  // YOUR OPINION — level-scoped, so it shows whether or not the level is beaten.
  // The face is the one the OPINION names, not the level's rated difficulty:
  // the two disagreeing is the whole point of the field.
  const opinion = data.difficultyOpinion
  const opinionFace = opinion ? opinionDifficulty(opinion) : null
  const opinionDisplay = opinion ? (
    <span className="flex items-center gap-1">
      {opinionFace && (
        <DifficultyFace difficulty={opinionFace} size={34} className="-my-1" />
      )}
      {opinionShortLabel(opinion)}
    </span>
  ) : (
    '—'
  )

  // RANKED
  const rankedDisplay =
    rankPosition != null ? `#${rankPosition} hardest` : 'Unplaced'

  const userGddlTier = data.userGddlTier

  return (
    <div
      className={cn(
        'grid gap-2',
        // Desktop sits inside a padded card; mobile is full-bleed and brings
        // its own padding.
        variant === 'mobile' ? 'grid-cols-2 px-4 py-3' : 'grid-cols-3'
      )}
    >
      <StatBox
        variant={variant}
        label="DATE"
        value={
          <span className="flex items-center gap-1">
            {dateText}
            {timeText && (
              <span className="text-[11px] font-normal text-text-tertiary">
                {timeText}
                {zoneSuffix ? ` ${zoneSuffix}` : ''}
              </span>
            )}
            {uncertain && (
              <HelpCircle
                size={13}
                className="shrink-0 text-warning"
                aria-label="Date uncertain"
              />
            )}
          </span>
        }
      />
      <StatBox
        variant={variant}
        label="ATTEMPTS"
        value={attempts != null ? formatNumber(attempts) : '—'}
      />
      <StatBox variant={variant} label="RATING" value={ratingDisplay} />
      <StatBox variant={variant} label="WORST FAIL" value={worstFailDisplay} />
      <StatBox variant={variant} label="YOUR OPINION" value={opinionDisplay} />
      <StatBox variant={variant} label="RANKED" value={rankedDisplay} />
      <StatBox variant={variant} label="ENJOYMENT" value={enjoymentDisplay} />
      <StatBox
        variant={variant}
        label="FPS"
        value={completion?.fps != null ? formatNumber(completion.fps) : '—'}
      />
      {userGddlTier != null && (
        <StatBox
          variant={variant}
          label="GDDL TIER"
          value={String(userGddlTier)}
        />
      )}
    </div>
  )
}
