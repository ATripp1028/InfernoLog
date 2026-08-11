import { useLocation, useNavigate } from '@tanstack/react-router'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { backOriginState } from '@/lib/backOrigin'
import { ListCard } from './ListCard'
import type { ColumnVisibility } from './columns'
import type { ListItem } from './types'

interface MobilePagerProps {
  items: ListItem[]
  columns: ColumnVisibility
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  hideTime: boolean
}

/**
 * Mobile list — each card taps through to the level page. Mobile-only (md+ shows ListTable).
 */
export function MobilePager({
  items,
  columns,
  scale,
  datePref,
  hideTime,
}: MobilePagerProps) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex flex-col gap-2 md:hidden">
      {items.map((item) => (
        <button
          key={item.levelProgressId}
          type="button"
          onClick={() =>
            navigate({
              to: '/list/$levelId',
              params: { levelId: item.level.inGameId },
              state: backOriginState(location.href),
            })
          }
          aria-label={`Open ${item.level.name ?? 'level'} details`}
          className="block w-full rounded-card text-left"
        >
          <ListCard
            item={item}
            columns={columns}
            scale={scale}
            datePref={datePref}
            hideTime={hideTime}
          />
        </button>
      ))}
    </div>
  )
}
