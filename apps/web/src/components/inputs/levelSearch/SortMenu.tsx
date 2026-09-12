import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LEVEL_SORT_OPTIONS,
  effectiveSortDir,
  sortSelectionPatch,
  type LevelSort,
  type LevelSortOption,
  type SearchPageState,
} from '@/lib/levelSearchParams'

interface SortMenuProps {
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
  /** The sorts offered; defaults to the /search page's. */
  options?: readonly LevelSortOption[]
}

/**
 * The sort menu body (rendered inside a popover from the bar's sort button): the
 * sort options plus an explicit ascending/descending toggle.
 */
export function SortMenu({
  state,
  onChange,
  options = LEVEL_SORT_OPTIONS,
}: SortMenuProps) {
  const dir = effectiveSortDir(state)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-sm font-medium text-text-primary">Sort by</p>
        <button
          type="button"
          onClick={() => onChange({ sortDir: dir === 'asc' ? 'desc' : 'asc' })}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {dir === 'asc' ? (
            <ArrowUpNarrowWide size={14} />
          ) : (
            <ArrowDownWideNarrow size={14} />
          )}
          {dir === 'asc' ? 'Ascending' : 'Descending'}
        </button>
      </div>

      <div className="flex flex-col">
        {options.map((o) => {
          const active = state.sort === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(sortSelectionPatch(o.value))}
              className={cn(
                'flex min-h-9 items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors',
                active
                  ? 'bg-primary-dim text-primary'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              )}
            >
              <span className="flex flex-col">
                {o.label}
                {o.hint && (
                  <span className="text-[11px] text-text-tertiary">
                    {o.hint}
                  </span>
                )}
              </span>
              {active && <Check size={15} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact label for the bar's sort trigger.
 */
export function sortTriggerLabel(
  sort: LevelSort,
  options: readonly LevelSortOption[] = LEVEL_SORT_OPTIONS
): string {
  return options.find((o) => o.value === sort)?.label ?? 'Sort'
}
