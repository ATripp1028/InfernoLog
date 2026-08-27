import { cn } from '@/lib/utils'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import type { LogItem } from './types'

/**
 * Name color encodes progress status: gold = completed, white = in progress,
 * red = dropped.
 */
export const NAME_COLOR: Record<LogItem['status'], string> = {
  COMPLETED: 'text-accent',
  IN_PROGRESS: 'text-text-primary',
  DROPPED: 'text-danger',
}

/**
 * The Level identity cell — difficulty face + name (+ 2P badge) + creator.
 * Shared by the columnar row and the mobile card.
 */
export function LevelCell({
  item,
  faceSize = 110,
}: {
  item: LogItem
  faceSize?: number
}) {
  const { level } = item
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={faceSize}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
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
      </div>
    </div>
  )
}
