import { cn } from '@/lib/utils'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { formatRating, formatNumber } from '@/features/logging/format'
import { formatDate } from '@/lib/dateFormat'
import { COLUMNS, type ColumnVisibility } from './columns'
import { gddlTier } from './filtering'
import { LevelCell } from './LevelCell'
import { TierBadge } from './TierBadge'
import { StatusIcons } from './StatusIcons'
import { RowWash } from './RowWash'
import type { ListItem } from './types'

interface RowProps {
  item: ListItem
  columns: ColumnVisibility
  scale: RatingDisplayScale
  datePref: DateFormatPreference
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
        'shrink-0 flex-col items-center justify-center gap-1',
        responsiveClass
      )}
      style={{ width }}
    >
      <div className="text-sm font-semibold text-text-primary">{children}</div>
      <div className="text-[10px] text-text-tertiary">{label}</div>
    </div>
  )
}

export function ListRow({ item, columns, scale, datePref }: RowProps) {
  const { entry } = item
  const dash = <span className="text-text-tertiary">—</span>

  return (
    <div className="relative h-[76px] overflow-hidden rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <RowWash item={item} />
      <div className="absolute inset-0 flex items-center gap-1 px-3">
        <LevelCell item={item} />
        {COLUMNS.map((col) => {
          if (!columns[col.id]) return null
          switch (col.id) {
            case 'tier':
              return (
                <div
                  key={col.id}
                  className={cn(
                    'shrink-0 flex-col items-center justify-center gap-1',
                    col.responsiveClass
                  )}
                  style={{ width: col.width }}
                >
                  <TierBadge tier={gddlTier(item)} />
                  <div className="text-[10px] text-text-tertiary">GDDL</div>
                </div>
              )
            case 'date':
              return (
                <Cell key={col.id} width={col.width} responsiveClass={col.responsiveClass} label="date">
                  {entry?.date ? (
                    <span className={entry.dateUncertain ? 'text-warning' : undefined}>
                      {formatDate(entry.date, datePref)}
                    </span>
                  ) : (
                    dash
                  )}
                </Cell>
              )
            case 'attempts':
              return (
                <Cell key={col.id} width={col.width} responsiveClass={col.responsiveClass} label="attempts">
                  {entry?.attempts != null ? formatNumber(entry.attempts) : dash}
                </Cell>
              )
            case 'rating':
              return (
                <Cell key={col.id} width={col.width} responsiveClass={col.responsiveClass} label="rating">
                  {entry?.overallRating != null
                    ? formatRating(entry.overallRating, scale)
                    : dash}
                </Cell>
              )
            case 'enjoy':
              return (
                <Cell key={col.id} width={col.width} responsiveClass={col.responsiveClass} label="enjoy">
                  {entry?.enjoyment != null
                    ? formatRating(entry.enjoyment, scale)
                    : dash}
                </Cell>
              )
            case 'status':
              return (
                <div
                  key={col.id}
                  className={cn('shrink-0 items-center justify-center', col.responsiveClass)}
                  style={{ width: col.width }}
                >
                  <StatusIcons item={item} />
                </div>
              )
          }
        })}
      </div>
    </div>
  )
}
