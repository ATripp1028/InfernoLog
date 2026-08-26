// The Log page's filter row: the kind chips, a level, and a date range.
//
// The chips are the four things a user recognises having done, not the event
// types behind them — one of them ("Progress") is not an activity_log row at
// all. RANKING_REBALANCE has no chip and no presence anywhere on this page.

import type { ActivityFeedKind } from '@infernolog/core'
import { Chip } from '@/components/generic/chip'
import { DatePickerField } from '@/components/inputs/DatePickerField'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/generic/select'
import { cn } from '@/lib/utils'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { LevelFilterBox } from './LevelFilterBox'
import {
  ACTIVITY_RANGES,
  KIND_CHIPS,
  type ActivityRangeKey,
  type CustomRange,
  type LevelOption,
} from './logFilters'
import { GlossarySheet } from './GlossarySheet'

export interface FeedFiltersProps {
  kinds: ActivityFeedKind[]
  onToggleKind: (kind: ActivityFeedKind) => void
  onClearKinds: () => void
  levelId: string | null
  onLevelChange: (levelId: string | null) => void
  levelOptions: LevelOption[]
  range: ActivityRangeKey
  onRangeChange: (range: ActivityRangeKey) => void
  customRange: CustomRange
  onCustomRangeChange: (range: CustomRange) => void
  datePref: DateFormatPreference
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
  customRange,
  onCustomRangeChange,
  datePref,
  onClear,
  canClear,
  countLabel,
  className,
}: FeedFiltersProps) {
  const selected = levelOptions.find((o) => o.levelId === levelId) ?? null
  const today = new Date().setHours(23, 59, 59, 999)

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="justify-between flex flex-wrap items-center gap-2">
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
        <GlossarySheet />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LevelFilterBox
          options={levelOptions}
          selected={selected}
          onSelect={onLevelChange}
        />

        <Select
          value={range}
          onValueChange={(v) => onRangeChange(v as ActivityRangeKey)}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
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

      {range === 'custom' && (
        // Both ends optional: "everything since March" and "everything before
        // June" are as ordinary a question as a closed range.
        <div className="flex max-w-[320px] gap-2">
          <DatePickerField
            label="From"
            value={customRange.from}
            onChange={(from) => onCustomRangeChange({ ...customRange, from })}
            datePref={datePref}
            {...(customRange.to !== null ? { max: customRange.to } : {})}
            placeholder="Any"
          />
          <DatePickerField
            label="To"
            value={customRange.to}
            onChange={(to) => onCustomRangeChange({ ...customRange, to })}
            datePref={datePref}
            {...(customRange.from !== null ? { min: customRange.from } : {})}
            max={today}
            placeholder="Today"
          />
        </div>
      )}

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
