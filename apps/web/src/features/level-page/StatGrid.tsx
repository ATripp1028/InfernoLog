import { HelpCircle } from 'lucide-react'
import { computeOverallRating } from '@infernolog/core'
import { formatNumber } from '@/lib/numberFormat'
import { formatRating } from '@/lib/ratingScale'
import type { RatingCategory } from '@/lib/api/me'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import type { LevelPageData } from '@/lib/api/levelPage'
import { formatEntryDate } from './timelineFormat'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

interface StatBoxProps {
  label: string
  value: React.ReactNode
}

function StatBox({ label, value }: StatBoxProps) {
  return (
    <div className="rounded-card border border-white/[0.12] bg-white/5 px-3 py-2 md:border-border md:bg-bg-surface md:px-3.5 md:py-3">
      <div className="text-[11px] uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div className="mt-1.5 text-sm font-medium text-text-primary md:text-base">
        {value}
      </div>
    </div>
  )
}

interface StatGridProps {
  data: LevelPageData
  datePref: DateFormatPreference
  scale: RatingDisplayScale
  ratingMode: 'SIMPLE' | 'WEIGHTED'
  includeEnjoyment: boolean
  enjoymentWeight: number
  ratingCategories: RatingCategory[]
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

  // YOUR OPINION
  const opinionDisplay = completion?.difficultyOpinion
    ? capitalize(completion.difficultyOpinion)
    : '—'

  // RANKED
  const rankedDisplay =
    rankPosition != null ? `#${rankPosition} hardest` : 'Unplaced'

  const userGddlTier = data.userGddlTier

  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3 md:grid-cols-3 md:gap-2 md:px-0 md:py-0">
      <StatBox
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
        label="ATTEMPTS"
        value={attempts != null ? formatNumber(attempts) : '—'}
      />
      <StatBox label="RATING" value={ratingDisplay} />
      <StatBox label="WORST FAIL" value={worstFailDisplay} />
      <StatBox label="YOUR OPINION" value={opinionDisplay} />
      <StatBox label="RANKED" value={rankedDisplay} />
      <StatBox label="ENJOYMENT" value={enjoymentDisplay} />
      <StatBox
        label="FPS"
        value={completion?.fps != null ? formatNumber(completion.fps) : '—'}
      />
      {userGddlTier != null && (
        <StatBox label="GDDL TIER" value={String(userGddlTier)} />
      )}
    </div>
  )
}
