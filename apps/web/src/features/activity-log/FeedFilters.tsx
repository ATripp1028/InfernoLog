// The Log page's filter row: the kind chips, a level, and a date range.
//
// The chips are the four things a user recognises having done, not the event
// types behind them — one of them ("Progress") is not an activity_log row at
// all. RANKING_REBALANCE has no chip and no presence anywhere on this page.

import type { ActivityFeedKind } from '@infernolog/core'
import { Chip } from '@/components/generic/chip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/generic/select'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_RANGES,
  ALL_LEVELS,
  KIND_CHIPS,
  type ActivityRangeKey,
  type LevelOption,
} from './logFilters'

export interface FeedFiltersProps {
  kinds: ActivityFeedKind[]
  onToggleKind: (kind: ActivityFeedKind) => void
  onClearKinds: () => void
  levelId: string | null
  onLevelChange: (levelId: string | null) => void
  levelOptions: LevelOption[]
  range: ActivityRangeKey
  onRangeChange: (range: ActivityRangeKey) => void
  onClear: () => void
  canClear: boolean
  countLabel: string
  className?: string
}

/**
 * The filter controls above the feed.
 *
 * @param onClearKinds - The "All" chip. Clearing every chip is what "All"
 * means, so it is not a fifth value the caller has to keep consistent.
 * @param countLabel - Rendered as-is; the page owns the wording because only it
 * knows whether more pages are still loading.
 */
export function FeedFilters({
  kinds,
  onToggleKind,
  onClearKinds,
  levelId,
  onLevelChange,
  levelOptions,
  range,
  onRangeChange,
  onClear,
  canClear,
  countLabel,
  className,
}: FeedFiltersProps) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip selected={kinds.length === 0} onClick={onClearKinds}>
          All
        </Chip>
        {KIND_CHIPS.map((chip) => (
          <Chip
            key={chip.kind}
            selected={kinds.includes(chip.kind)}
            onClick={() => onToggleKind(chip.kind)}
          >
            {chip.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={levelId ?? ALL_LEVELS}
          onValueChange={(v) => onLevelChange(v === ALL_LEVELS ? null : v)}
        >
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LEVELS}>All levels</SelectItem>
            {levelOptions.map((option) => (
              <SelectItem key={option.levelId} value={option.levelId}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={range}
          onValueChange={(v) => onRangeChange(v as ActivityRangeKey)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_RANGES.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-text-tertiary">{countLabel}</span>
      </div>

      {levelId !== null && (
        // Rating-setup changes belong to the account, not to any level, so they
        // drop out of a level-filtered feed by definition. Saying so beats
        // leaving a silent hole the reader has to work out for themselves.
        <p className="text-[11px] text-text-tertiary">
          Account-wide events are hidden while filtered to a level.
        </p>
      )}
    </div>
  )
}
