import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SORT_OPTIONS,
  effectiveSortDir,
  naturalSortDir,
  type LevelSort,
  type SearchPageState,
} from '@/lib/levelSearchParams'

interface SortMenuProps {
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
}

// The sort menu body (rendered inside a popover from the bar's sort button): the
// sort options plus an explicit ascending/descending toggle.
export function SortMenu({ state, onChange }: SortMenuProps) {
  const dir = effectiveSortDir(state)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-sm font-medium text-text-primary">Sort by</p>
        <button
          type="button"
          onClick={() => onChange({ sortDir: dir === 'asc' ? 'desc' : 'asc' })}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
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
        {SORT_OPTIONS.map((o) => {
          const active = state.sort === o.value
          return (
            <button
              key={o.value}
              type="button"
              // Picking a sort resets the direction to that sort's natural one,
              // so the toggle always starts from a predictable default.
              onClick={() =>
                onChange({ sort: o.value, sortDir: naturalSortDir(o.value) })
              }
              className={cn(
                'flex h-9 items-center justify-between rounded-md px-2 text-sm transition-colors',
                active
                  ? 'bg-primary-dim text-primary'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              )}
            >
              {o.label}
              {active && <Check size={15} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Compact label for the bar's sort trigger.
export function sortTriggerLabel(sort: LevelSort): string {
  return SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Sort'
}
