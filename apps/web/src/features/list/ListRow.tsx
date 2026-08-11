import { cn } from '@/lib/utils'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { formatNumber } from '@/features/logging/format'
import { formatRating } from '@/lib/ratingScale'
import { formatEntryDateTime } from '@/lib/dateFormat'
import { getViewerTimezone } from '@/lib/timezone'
import { type ColumnDef, type ColumnId, type ColumnVisibility } from './columns'
import { gddlTier } from './filtering'
import { coinDisplay } from './coins'
import { CopyableId } from '@/components/data/CopyableId'
import { LevelCell } from './LevelCell'
import { TierBadge } from './TierBadge'
import { StatusIcons } from './StatusIcons'
import { RowWash } from './RowWash'
import type { ListItem } from './types'

const VIEWER_TZ = getViewerTimezone()

/**
 * Minimum width reserved for the Level (face + name) cell before the table
 * scrolls horizontally — keeps long names readable rather than squeezing them.
 */
export const LEVEL_MIN_WIDTH = 280

interface RowProps {
  item: ListItem
  columns: ColumnVisibility
  columnOrder: ColumnId[]
  allColumnDefs: ColumnDef[]
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  hideTime: boolean
  minWidth: number
}

// One value-over-label cell for the columnar layout.
function Cell({
  width,
  responsiveClass,
  children,
  label,
}: {
  width: number
  responsiveClass: string
  children: React.ReactNode
  label: string
}) {
  return (
    <div
      className={cn(
        'relative shrink-0 flex-col items-center justify-center gap-1',
        responsiveClass
      )}
      style={{ width }}
    >
      <div className="truncate text-sm font-semibold text-text-primary">
        {children}
      </div>
      <div className="text-[10px] text-text-tertiary">{label}</div>
    </div>
  )
}

function CoinsCell({ item }: { item: ListItem }) {
  const coins = coinDisplay(item.level)
  if (!coins) return <span className="text-text-tertiary">—</span>
  return (
    <div className="flex items-center justify-center gap-0.5">
      {Array.from({ length: coins.count }).map((_, i) => (
        <img key={i} src={coins.src} alt="" className="size-4" />
      ))}
    </div>
  )
}

/**
 * One row of the columnar List table.
 */
export function ListRow({
  item,
  columns,
  columnOrder,
  allColumnDefs,
  scale,
  datePref,
  hideTime,
  minWidth,
}: RowProps) {
  const { entry, level, overallRating, ratingScores } = item
  const dash = <span className="text-text-tertiary">—</span>

  const orderedCols = columnOrder
    .map((id) => allColumnDefs.find((c) => c.id === id)!)
    .filter((col) => col != null && columns[col.id])

  return (
    <div
      className="relative flex h-[88px] items-center overflow-hidden px-3"
      style={{ minWidth }}
    >
      <RowWash item={item} />
      <div
        className="relative flex min-w-0 flex-1"
        style={{ minWidth: LEVEL_MIN_WIDTH }}
      >
        <LevelCell item={item} />
      </div>
      {orderedCols.map((col) => {
        switch (col.id) {
          case 'tier':
            return (
              <div
                key={col.id}
                className={cn(
                  'relative shrink-0 flex-col items-center justify-center gap-1',
                  col.responsiveClass
                )}
                style={{ width: col.width }}
              >
                <TierBadge tier={gddlTier(item)} />
                <div className="text-[10px] text-text-tertiary">GDDL</div>
              </div>
            )
          case 'date': {
            const display = entry?.date
              ? formatEntryDateTime(
                  entry.date,
                  entry.dateTimezone,
                  datePref,
                  VIEWER_TZ
                )
              : null
            return (
              <div
                key={col.id}
                className={cn(
                  'relative shrink-0 flex-col items-center justify-center gap-0.5',
                  col.responsiveClass
                )}
                style={{ width: col.width }}
              >
                <div className="truncate text-sm font-semibold text-text-primary">
                  {display ? (
                    <span
                      className={
                        entry?.dateUncertain ? 'text-warning' : undefined
                      }
                    >
                      {display.dateText}
                      {entry?.dateUncertain && (
                        <span title="Uncertain date" className="text-warning">
                          {' '}
                          ?
                        </span>
                      )}
                    </span>
                  ) : (
                    dash
                  )}
                </div>
                {!hideTime && display?.timeText && (
                  <div className="truncate text-[9px] leading-tight text-text-tertiary">
                    {display.timeText}
                    {display.showZoneBadge ? ` ${display.zoneLabel}` : ''}
                  </div>
                )}
                <div className="text-[10px] text-text-tertiary">date</div>
              </div>
            )
          }
          case 'attempts':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="attempts"
              >
                {entry?.attempts != null ? formatNumber(entry.attempts) : dash}
              </Cell>
            )
          case 'rating':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="rating"
              >
                {overallRating != null
                  ? formatRating(overallRating, scale)
                  : dash}
              </Cell>
            )
          case 'enjoy':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="enjoy"
              >
                {entry?.enjoyment != null
                  ? formatRating(entry.enjoyment, scale)
                  : dash}
              </Cell>
            )
          case 'id':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="id"
              >
                <CopyableId id={level.inGameId} label="Level ID" />
              </Cell>
            )
          case 'creator':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="creator"
              >
                {level.creator ?? dash}
              </Cell>
            )
          case 'length':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="length"
              >
                {level.length ?? dash}
              </Cell>
            )
          case 'songName':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="song"
              >
                {level.songName ?? dash}
              </Cell>
            )
          case 'songArtist':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="artist"
              >
                {level.songAuthor ?? dash}
              </Cell>
            )
          case 'coins':
            return (
              <div
                key={col.id}
                className={cn(
                  'relative shrink-0 flex-col items-center justify-center gap-1',
                  col.responsiveClass
                )}
                style={{ width: col.width }}
              >
                <CoinsCell item={item} />
                <div className="text-[10px] text-text-tertiary">coins</div>
              </div>
            )
          case 'version':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="version"
              >
                {level.gameVersion ?? dash}
              </Cell>
            )
          case 'device':
            return (
              <Cell
                key={col.id}
                width={col.width}
                responsiveClass={col.responsiveClass}
                label="device"
              >
                {entry?.device
                  ? entry.device === 'pc'
                    ? 'PC'
                    : 'Mobile'
                  : dash}
              </Cell>
            )
          case 'status':
            return (
              <div
                key={col.id}
                className={cn(
                  'relative shrink-0 items-center justify-center',
                  col.responsiveClass
                )}
                style={{ width: col.width }}
              >
                <StatusIcons item={item} />
              </div>
            )
          default: {
            // `cat:${categoryId}` — individual weighted-rating category score.
            if (col.id.startsWith('cat:')) {
              const catId = col.id.slice(4)
              const score =
                ratingScores.find((r) => r.categoryId === catId)?.score ?? null
              return (
                <Cell
                  key={col.id}
                  width={col.width}
                  responsiveClass={col.responsiveClass}
                  label={col.label.toLowerCase()}
                >
                  {score != null ? formatRating(score, scale) : dash}
                </Cell>
              )
            }
            return null
          }
        }
      })}
    </div>
  )
}
