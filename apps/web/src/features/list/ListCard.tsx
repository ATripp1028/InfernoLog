import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { DifficultyFace } from '@/components/DifficultyFace'
import { formatRating, formatNumber } from '@/features/logging/format'
import { formatDate } from '@/lib/dateFormat'
import { gddlTier } from './filtering'
import { TierBadge } from './TierBadge'
import { StatusIcons } from './StatusIcons'
import { RowWash } from './RowWash'
import type { ListItem } from './types'

// Mobile two-line card. Line 1: face + name + tier + status icons. Line 2:
// date · attempts · rating · enjoyment.
export function ListCard({
  item,
  scale,
  datePref,
}: {
  item: ListItem
  scale: RatingDisplayScale
  datePref: DateFormatPreference
}) {
  const { entry, level } = item
  const stats: string[] = []
  if (entry?.date) stats.push(formatDate(entry.date, datePref))
  if (entry?.attempts != null) stats.push(`${formatNumber(entry.attempts)} att`)
  if (entry?.overallRating != null)
    stats.push(formatRating(entry.overallRating, scale))
  if (entry?.enjoyment != null)
    stats.push(`★ ${formatRating(entry.enjoyment, scale)}`)

  return (
    <div className="relative overflow-hidden rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2.5">
      <RowWash item={item} />
      <div className="relative flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <DifficultyFace
            difficulty={level.inGameDifficulty}
            featured={level.featured}
            epicValue={level.epicValue}
            rated={level.isRated}
            size={28}
          />
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-text-primary">
            {level.name ?? 'Unknown level'}
          </p>
          <TierBadge tier={gddlTier(item)} />
          <StatusIcons item={item} />
        </div>
        <p className="pl-9 text-xs text-text-secondary">
          {stats.length ? stats.join('  ·  ') : 'No progress logged'}
        </p>
      </div>
    </div>
  )
}
