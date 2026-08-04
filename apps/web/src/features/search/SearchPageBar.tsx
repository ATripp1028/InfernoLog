import { useEffect, useRef } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SEARCH_BY_OPTIONS, type LevelSearchBy } from '@/lib/levelSearchParams'
import { useSearchPageBar } from './useSearchPageBar'

interface SearchPageBarProps {
  bar: ReturnType<typeof useSearchPageBar>
  autoFocus?: boolean
}

// The top-center search bar for /search: a "search by" selector and the query
// input. The query is live (see useSearchPageBar) — the results grid updates as
// you type. Enter flushes immediately; a numeric-only input is a level id and
// gets a "go to level" affordance (Enter or the button opens it).
export function SearchPageBar({ bar, autoFocus = false }: SearchPageBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

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
