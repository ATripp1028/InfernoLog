import { HelpCircle } from 'lucide-react'
import { formatDate } from '@/lib/dateFormat'
import { formatRating, formatNumber } from '@/features/logging/format'
import type {
  DateFormatPreference,
  RatingDisplayScale,
  RatingCategory,
} from '@/lib/api/me'
import type { LevelPageData, ProgressUpdate } from './types'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function getDateDisplay(
  update: ProgressUpdate | undefined,
  fallbackIso: string,
  datePref: DateFormatPreference
): { text: string; uncertain: boolean } {
  if (update?.date) {
    return {
      text: formatDate(update.date, datePref),
      uncertain: update.dateUncertain,
    }
  }
  return { text: formatDate(fallbackIso, datePref), uncertain: false }
}

// Replicates apps/api/src/utils/rating.ts on the client side so the level
// page can display the proper overall rating without an extra API call.
function computeOverallRating(
  ratingMode: 'SIMPLE' | 'WEIGHTED',
  includeEnjoyment: boolean,
  enjoymentWeight: number,
  categoryWeights: Map<string, number>,
  update: {
    simpleRating: number | null
    enjoyment: number | null
    ratingScores: { categoryId: string; score: number }[]
  }
): number | null {
  if (ratingMode === 'SIMPLE') {
    return update.simpleRating
  }

  let weightedSum = 0
  let weightTotal = 0

  for (const { categoryId, score } of update.ratingScores) {
    const weight = categoryWeights.get(categoryId)
    if (weight === undefined) continue
    weightedSum += score * weight
    weightTotal += weight
  }

  if (includeEnjoyment && update.enjoyment !== null) {
    weightedSum += update.enjoyment * enjoymentWeight
    weightTotal += enjoymentWeight
  }

  if (weightTotal === 0) return null
  return Math.round(weightedSum / weightTotal)
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

export function StatGrid({
  data,
  datePref,
  scale,
  ratingMode,
  includeEnjoyment,
  enjoymentWeight,
  ratingCategories,
}: StatGridProps) {
  const {
    progressUpdates,
    rankPosition,
    worstFail,
    droppedAt,
    attemptsAtDrop,
  } = data

  const completion = progressUpdates.find((u) => u.isCompletion)
  const latestUpdate = progressUpdates[0]

  // DATE: completion date → most recent update date → last-updated
  const { text: dateText, uncertain } =
    data.status === 'DROPPED' && droppedAt
      ? { text: formatDate(droppedAt, datePref), uncertain: false }
      : getDateDisplay(completion ?? latestUpdate, data.updatedAt, datePref)

  // ATTEMPTS: completion → drop attempts → latest update → null
  const attempts =
    completion?.attempts ?? attemptsAtDrop ?? latestUpdate?.attempts ?? null

  // RATING — computed overall rating (weighted avg or simple per user mode),
  // shown separately from enjoyment. GDDL tier has its own stat box.
  const categoryWeights = new Map(
    ratingCategories.map((cat) => [cat.id, cat.weight])
  )
  const overallRating = completion
    ? computeOverallRating(
        ratingMode,
        includeEnjoyment,
        enjoymentWeight,
        categoryWeights,
        completion
      )
    : null
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
            {uncertain && (
              <HelpCircle
                size={13}
                className="shrink-0 text-[var(--color-warning)]"
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
      {userGddlTier != null && <StatBox label="GDDL TIER" value={String(userGddlTier)} />}
    </div>
  )
}
