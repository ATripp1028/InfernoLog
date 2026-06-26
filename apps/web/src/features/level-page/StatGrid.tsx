import { HelpCircle } from 'lucide-react'
import { formatDate } from '@/lib/dateFormat'
import { formatRating, formatNumber } from '@/features/logging/format'
import type { DateFormatPreference, RatingDisplayScale } from '@/lib/api/me'
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
}

export function StatGrid({ data, datePref, scale }: StatGridProps) {
  const { progressUpdates, rankPosition, worstFail, droppedAt, attemptsAtDrop } =
    data

  const completion = progressUpdates.find((u) => u.isCompletion)
  // Most recent progress update (first in newest-first array)
  const latestUpdate = progressUpdates[0]

  // DATE: completion date → most recent update date → last-updated
  const { text: dateText, uncertain } =
    data.status === 'DROPPED' && droppedAt
      ? { text: formatDate(droppedAt, datePref), uncertain: false }
      : getDateDisplay(completion ?? latestUpdate, data.updatedAt, datePref)

  // ATTEMPTS: completion → drop attempts → latest update → null
  const attempts =
    completion?.attempts ?? attemptsAtDrop ?? latestUpdate?.attempts ?? null

  // RATING (with enjoyment)
  const rating =
    completion?.simpleRating != null
      ? formatRating(completion.simpleRating, scale)
      : null
  const enjoyment =
    completion?.enjoyment != null
      ? formatRating(completion.enjoyment, scale)
      : null
  const ratingDisplay =
    rating != null && enjoyment != null
      ? `${rating} · enj ${enjoyment}`
      : rating != null
        ? rating
        : enjoyment != null
          ? `enj ${enjoyment}`
          : '—'

  // WORST FAIL
  const worstFailDisplay = worstFail != null ? `${worstFail}%` : '—'

  // YOUR OPINION
  const opinionDisplay =
    completion?.difficultyOpinion
      ? capitalize(completion.difficultyOpinion)
      : '—'

  // RANKED
  const rankedDisplay =
    rankPosition != null ? `#${rankPosition} hardest` : 'Unplaced'

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
    </div>
  )
}
