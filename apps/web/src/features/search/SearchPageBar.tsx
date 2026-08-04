import { useEffect, useRef } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUpNarrowWide,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SEARCH_BY_OPTIONS,
  effectiveSortDir,
  hasActiveFilters,
  type LevelSearchBy,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { SearchFilters } from './SearchFilters'
import { SortMenu, sortTriggerLabel } from './SortMenu'
import { useSearchPageBar } from './useSearchPageBar'

interface SearchPageBarProps {
  bar: ReturnType<typeof useSearchPageBar>
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
  onReset: () => void
  autoFocus?: boolean
}

// A bar-height pill button used for the sort and filter popover triggers.
function BarButton({
  children,
  active = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex h-11 shrink-0 items-center gap-1.5 rounded-btn border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary/60 bg-primary-dim text-text-primary'
          : 'border-[#333333] bg-[#212121] text-text-secondary hover:text-text-primary'
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// The top-center search bar for /search: a "search by" selector, the live query
// input, a sort menu, a filter menu, and the Search button. The query is live
// (see useSearchPageBar); Enter flushes; a numeric-only input is a level id with
// a "go to level" affordance.
export function SearchPageBar({
  bar,
  state,
  onChange,
  onReset,
  autoFocus = false,
}: SearchPageBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dir = effectiveSortDir(state)
  const filtersActive = hasActiveFilters(state)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-2">
        <div className="w-[128px] shrink-0 sm:w-[148px]">
          <Select
            value={bar.searchBy}
            onValueChange={(v) => bar.setSearchBy(v as LevelSearchBy)}
          >
            <SelectTrigger className="h-11" aria-label="Search by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEARCH_BY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex h-11 flex-1 items-center gap-2 rounded-btn border border-[#333333] bg-[#212121] px-3 text-text-tertiary">
          <Search size={18} />
          <input
            ref={inputRef}
            type="search"
            value={bar.query}
            onChange={(e) => bar.setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                bar.submit()
              }
            }}
            placeholder={
              bar.searchBy === 'creator'
                ? 'Search by creator…'
                : 'Search levels or enter a level ID…'
            }
            aria-label="Search levels"
            autoComplete="off"
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>

        {/* Sort — right of the search bar. */}
        <Popover>
          <PopoverTrigger asChild>
            <BarButton aria-label="Sort results">
              {dir === 'asc' ? (
                <ArrowUpNarrowWide size={16} />
              ) : (
                <ArrowDownWideNarrow size={16} />
              )}
              <span className="hidden sm:inline">
                {sortTriggerLabel(state.sort)}
              </span>
            </BarButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-2">
            <SortMenu state={state} onChange={onChange} />
          </PopoverContent>
        </Popover>

        {/* Filters — between the sort control and the Search button. */}
        <Popover>
          <PopoverTrigger asChild>
            <BarButton aria-label="Filters" active={filtersActive}>
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Filters</span>
              {filtersActive && (
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary" />
              )}
            </BarButton>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[70vh] w-[min(92vw,400px)] overflow-y-auto p-4"
          >
            <SearchFilters
              state={state}
              onChange={onChange}
              onReset={onReset}
              hasFilters={filtersActive}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={bar.submit}
          className="shrink-0 rounded-btn bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Search
        </button>
      </div>

      {/* A numeric input is a level id, not a browse term — offer the jump. */}
      {bar.numericId && (
        <button
          type="button"
          onClick={() => bar.goToLevel(bar.numericId!)}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary-light)] hover:brightness-110"
        >
          <ArrowRight size={16} />
          Go to level {bar.numericId}
          <span className="text-text-tertiary">· press Enter</span>
        </button>
      )}
    </div>
  )
}
