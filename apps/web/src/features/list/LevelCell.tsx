import { cn } from '@/lib/utils'
import { DifficultyFace } from '@/components/DifficultyFace'
import type { ListItem } from './types'

// The Level identity cell — difficulty face + name + creator. Shared by the
// columnar row and the mobile card.
export function LevelCell({
  item,
  faceSize = 36,
}: {
  item: ListItem
  faceSize?: number
}) {
  const { level } = item
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={faceSize}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p
          className={cn(
            'truncate text-[15px] font-bold leading-tight',
            level.isDemon ? 'text-accent' : 'text-text-primary'
          )}
        >
          {level.name ?? 'Unknown level'}
        </p>
        <p className="truncate text-xs text-text-secondary">
          by {level.creator ?? 'Unknown'}
        </p>
      </div>
    </div>
  )
}
