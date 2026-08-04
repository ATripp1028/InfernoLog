import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SEARCH_BY_OPTIONS, type LevelSearchBy } from '@/lib/levelSearchParams'
import { SearchResultRow } from './SearchResultRow'
import { useSearchPageBar } from './useSearchPageBar'

interface SearchPageBarProps {
  bar: ReturnType<typeof useSearchPageBar>
  autoFocus?: boolean
}

// The top-center search bar for /search: a "search by" selector, the query
// input with its live cache dropdown, and a Search button. Enter or the button
// commits (see useSearchPageBar.submit); a dropdown suggestion opens that level.
export function SearchPageBar({ bar, autoFocus = false }: SearchPageBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!bar.open) return
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) bar.setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [bar])

  const showDropdown =
    bar.open &&
    bar.query.trim().length > 0 &&
    (bar.items.length > 0 || bar.isSearching)

  return (
    <div ref={containerRef} className="relative w-full">
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
            onChange={(e) => {
              bar.setQuery(e.target.value)
              bar.setOpen(true)
            }}
            onFocus={() => bar.setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                bar.submit()
              } else if (e.key === 'Escape') {
                bar.setOpen(false)
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

      {showDropdown && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-card border border-[#333333] bg-[#212121] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          {bar.isSearching && (
            <p className="px-5 py-3 text-sm text-text-tertiary">Searching…</p>
          )}
          {bar.items.map((item) =>
            item.level ? (
              <SearchResultRow
                key={item.id}
                level={item.level}
                onSelect={() => bar.goToLevel(item.id)}
              />
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => bar.goToLevel(item.id)}
                className={cn(
                  'flex h-14 w-full items-center gap-3 px-5 text-left text-sm text-text-primary transition-colors hover:bg-white/[0.03]'
                )}
              >
                Go to level {item.id}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
