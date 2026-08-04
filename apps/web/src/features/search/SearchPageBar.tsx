import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUpNarrowWide,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { MobileActionSheet } from '@/components/MobileActionSheet'
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

// A bar-height pill button used for the sort and filter menu triggers.
function BarButton({
  children,
  active = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex h-11 shrink-0 items-center gap-1.5 rounded-btn border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary/60 bg-primary-dim text-text-primary'
          : 'border-[#333333] bg-[#212121] text-text-secondary hover:text-text-primary',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// A menu that anchors as a popover on desktop and pulls up as a bottom sheet on
// mobile (the platform's mobile menu pattern — see MobileActionSheet). The
// trigger BarButton is the only flex participant in either mode (the sheet is
// fixed-position, the popover content is portaled).
function ResponsiveMenu({
  ariaLabel,
  active = false,
  triggerInner,
  className,
  popoverClassName,
  children,
}: {
  ariaLabel: string
  active?: boolean
  triggerInner: React.ReactNode
  className?: string
  popoverClassName?: string
  children: React.ReactNode
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)

  if (isDesktop) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <BarButton
            active={active}
            aria-label={ariaLabel}
            className={className}
          >
            {triggerInner}
          </BarButton>
        </PopoverTrigger>
        <PopoverContent align="end" className={popoverClassName}>
          {children}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <BarButton
        active={active}
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen(true)}
      >
        {triggerInner}
      </BarButton>
      <MobileActionSheet
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={ariaLabel}
      >
        <div className="max-h-[60vh] overflow-y-auto px-4 pb-6 pt-1">
          {children}
        </div>
      </MobileActionSheet>
    </>
  )
}

// The top-center search bar for /search. On mobile the query input + Search
// button sit on their own row above the search-by / sort / filter controls; on
// desktop everything is a single row. The query is live (see useSearchPageBar);
// Enter flushes, and a numeric-only input is a level id with a jump affordance.
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
      <div className="flex flex-wrap items-stretch gap-2 md:flex-nowrap">
        {/* Search by (mobile row 2 / desktop leftmost). */}
        <div className="order-4 w-[128px] shrink-0 sm:w-[148px] md:order-1">
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

        {/* Query input (mobile row 1). */}
        <div className="order-1 flex h-11 min-w-0 flex-1 items-center gap-2 rounded-btn border border-[#333333] bg-[#212121] px-3 text-text-tertiary md:order-2">
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

        {/* Search button (mobile row 1, after the input). */}
        <button
          type="button"
          onClick={bar.submit}
          className="order-2 shrink-0 rounded-btn bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover md:order-5"
        >
          Search
        </button>

        {/* Row break: forces the controls below the query row on mobile only. */}
        <div aria-hidden className="order-3 basis-full md:hidden" />

        {/* Sort. */}
        <ResponsiveMenu
          ariaLabel="Sort results"
          className="order-5 md:order-3"
          popoverClassName="w-[240px] p-2"
          triggerInner={
            <>
              {dir === 'asc' ? (
                <ArrowUpNarrowWide size={16} />
              ) : (
                <ArrowDownWideNarrow size={16} />
              )}
              <span className="hidden sm:inline">
                {sortTriggerLabel(state.sort)}
              </span>
            </>
          }
        >
          <SortMenu state={state} onChange={onChange} />
        </ResponsiveMenu>

        {/* Filters. */}
        <ResponsiveMenu
          ariaLabel="Filters"
          active={filtersActive}
          className="order-6 md:order-4"
          popoverClassName="max-h-[70vh] w-[min(92vw,400px)] overflow-y-auto p-4"
          triggerInner={
            <>
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Filters</span>
              {filtersActive && (
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary" />
              )}
            </>
          }
        >
          <SearchFilters
            state={state}
            onChange={onChange}
            onReset={onReset}
            hasFilters={filtersActive}
          />
        </ResponsiveMenu>
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
