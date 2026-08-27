import { cn } from '@/lib/utils'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { formatNumber } from '@/features/logging/format'
import { formatRating } from '@/lib/ratingScale'
import { formatEntryDateTime } from '@/lib/dateFormat'
import { getViewerTimezone } from '@/lib/timezone'
import { gddlTier } from './filtering'
import { coinDisplay } from './coins'
import { NAME_COLOR } from './LevelCell'
import { GddlTierBadge } from '@/components/data/GddlTierBadge'
import { StatusIcons } from './StatusIcons'
import { RowWash } from './RowWash'
import type { ColumnVisibility } from './columns'
import type { LogItem } from './types'

const VIEWER_TZ = getViewerTimezone()

/**
 * Mobile card. Face, tier badge, and status icons are vertically centered in a
 * single row; the stats line reflects the enabled column toggles.
 */
export function LogCard({
  item,
  columns,
  scale,
  datePref,
  hideTime,
}: {
  item: LogItem
  columns: ColumnVisibility
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  hideTime: boolean
}) {
  const { entry, level, overallRating } = item

  // Text stats follow the column toggles (so toggling columns is meaningful on
  // mobile, where there's no table).
  const stats: string[] = []
  if (columns.date && entry?.date) {
    const display = formatEntryDateTime(
      entry.date,
      entry.dateTimezone,
      datePref,
      VIEWER_TZ
    )
    const time =
      !hideTime && display.timeText
        ? ` ${display.timeText}${display.showZoneBadge ? ` ${display.zoneLabel}` : ''}`
        : ''
    stats.push(`${display.dateText}${time}${entry.dateUncertain ? ' ?' : ''}`)
  }
  if (columns.attempts && entry?.attempts != null)
    stats.push(`${formatNumber(entry.attempts)} att`)
  if (columns.rating && overallRating != null)
    stats.push(formatRating(overallRating, scale))
  if (columns.enjoy && entry?.enjoyment != null)
    stats.push(`★ ${formatRating(entry.enjoyment, scale)}`)
  if (columns.length && level.length) stats.push(level.length)
  if (columns.version && level.gameVersion) stats.push(level.gameVersion)
  if (columns.songName && level.songName) stats.push(level.songName)
  if (columns.songArtist && level.songAuthor) stats.push(level.songAuthor)
  if (columns.id) stats.push(`#${level.inGameId}`)

  const coins = columns.coins ? coinDisplay(level) : null

  return (
    <div className="relative overflow-hidden rounded-card border border-border-subtle bg-bg-surface px-3 py-3">
      <RowWash item={item} />
      <div className="relative flex items-center gap-3">
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={104}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className={cn(
                'truncate text-[15px] font-bold leading-tight',
                NAME_COLOR[item.status]
              )}
            >
              {level.name ?? 'Unknown level'}
            </p>
            {level.twoPlayer && (
              <span className="shrink-0 rounded bg-bg-elevated px-1 text-[9px] font-bold text-text-secondary">
                2P
              </span>
            )}
          </div>
          <p className="truncate text-xs text-text-secondary">
            by {level.creator ?? 'Unknown'}
          </p>
          {(stats.length > 0 || coins) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
              {stats.map((s, i) => (
                <span key={i}>{s}</span>
              ))}
              {coins && (
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: coins.count }).map((_, i) => (
                    <img key={i} src={coins.src} alt="" className="size-3.5" />
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {columns.tier && <GddlTierBadge tier={gddlTier(item)} />}
          {columns.status && <StatusIcons item={item} interactive={false} />}
        </div>
      </div>
    </div>
  )
}
