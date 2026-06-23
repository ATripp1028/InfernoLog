import { useState } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { ListCard } from './ListCard'
import { DetailPane } from './DetailPane'
import type { ColumnVisibility } from './columns'
import type { ListItem } from './types'

interface MobilePagerProps {
  items: ListItem[]
  columns: ColumnVisibility
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  onEditItem: (item: ListItem) => void
  onDeleteItem: (item: ListItem) => void
}

// AREDL-style two-pane mobile view: List (left) → Detail (right). Tapping a card
// slides to its detail; swiping right or the back button returns. A two-dot
// indicator shows the active pane. Mobile-only (the page hides this at md+).
export function MobilePager({
  items,
  columns,
  scale,
  datePref,
  onEditItem,
  onDeleteItem,
}: MobilePagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    selectedId != null
      ? (items.find((i) => i.level.inGameId === selectedId) ?? null)
      : null
  const index = selected ? 1 : 0

  function handleDragEnd(_event: unknown, info: PanInfo) {
    // A rightward swipe while in the detail pane returns to the list.
    if (index === 1 && info.offset.x > 80) setSelectedId(null)
  }

  return (
    <div className="md:hidden">
      <div className="relative h-[70dvh] overflow-hidden">
        <motion.div
          className="flex h-full w-[200%]"
          animate={{ x: index === 0 ? '0%' : '-50%' }}
          transition={{ type: 'tween', duration: 0.25 }}
          drag={selected ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
        >
          <div className="h-full w-1/2 overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <button
                  key={item.levelProgressId}
                  type="button"
                  onClick={() => setSelectedId(item.level.inGameId)}
                  className="block w-full text-left"
                >
                  <ListCard
                    item={item}
                    columns={columns}
                    scale={scale}
                    datePref={datePref}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="h-full w-1/2 overflow-hidden pl-1">
            {selected && (
              <DetailPane
                item={selected}
                scale={scale}
                datePref={datePref}
                onBack={() => setSelectedId(null)}
                onEdit={() => onEditItem(selected)}
                onDelete={() => onDeleteItem(selected)}
              />
            )}
          </div>
        </motion.div>
      </div>

      {/* Position indicator */}
      <div className="mt-3 flex justify-center gap-1.5">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === index
                ? 'w-5 bg-[var(--color-primary)]'
                : 'w-1.5 bg-[var(--color-bg-subtle)]'
            )}
          />
        ))}
      </div>
    </div>
  )
}
