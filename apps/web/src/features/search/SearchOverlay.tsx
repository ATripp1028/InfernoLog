import { useEffect, useRef } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { SearchResults } from './SearchResults'
import { useToolbarSearch } from './useToolbarSearch'

interface SearchOverlayProps {
  onClose: () => void
}

// The mobile search surface. Deliberately NOT a route (locked decision 1):
// back-button / deep-link semantics are wrong for a transient search, so the
// `←` in the top bar is the only dismissal — the system back gesture can't
// reach it. Full-screen; the results region is the only scroller so the layout
// holds with the keyboard up (~489px / ~8 rows visible).
export function SearchOverlay({ onClose }: SearchOverlayProps) {
  const state = useToolbarSearch()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-base md:hidden">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="flex size-11 shrink-0 items-center justify-center text-text-primary"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex h-10 flex-1 items-center gap-2 rounded-btn border border-[#333333] bg-[#212121] px-3 text-text-tertiary">
          <Search size={16} />
          <input
            ref={inputRef}
            type="search"
            value={state.query}
            onChange={(e) => state.setQuery(e.target.value)}
            onKeyDown={state.handleKeyDown}
            placeholder="Search levels…"
            aria-label="Search levels"
            autoComplete="off"
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SearchResults state={state} compact onAfterSelect={onClose} />
      </div>
    </div>
  )
}
