import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { AvatarMenu } from './AvatarMenu'
import { Logo } from './Logo'
import { SearchOverlay } from '@/features/search/SearchOverlay'
import { SearchResults } from '@/features/search/SearchResults'
import { useToolbarSearch } from '@/features/search/useToolbarSearch'

export function AppHeader() {
  const state = useToolbarSearch()
  const [open, setOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close the desktop dropdown on an outside click.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const hasDropdownContent =
    state.items.length > 0 ||
    state.showNoResults ||
    state.isSearching ||
    state.canEscalate
  const showDropdown = open && state.trimmed.length > 0 && hasDropdownContent

  function closeDropdown() {
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-subtle bg-bg-surface px-4 xl:px-6">
      <div className="xl:hidden">
        <Logo variant="icon" />
      </div>
      <div className="hidden xl:block">
        <Logo variant="full" />
      </div>

      <div className="relative flex-1" ref={containerRef}>
        {/* Desktop: live field + anchored dropdown. */}
        <div className="hidden md:block">
          <div className="flex h-10 items-center gap-2 rounded-btn border border-[#333333] bg-[#212121] px-3 text-text-tertiary">
            <Search size={16} />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search levels…"
              aria-label="Search levels"
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="header-search-results"
              autoComplete="off"
              value={state.query}
              onChange={(e) => {
                state.setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  closeDropdown()
                  return
                }
                if (showDropdown) state.handleKeyDown(e)
              }}
              className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>

          <AnimatePresence>
            {showDropdown && (
              <motion.div
                id="header-search-results"
                role="listbox"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-card border border-[#333333] bg-[#212121] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
              >
                <SearchResults state={state} onAfterSelect={closeDropdown} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile: tap to open the full-screen overlay (not a route). */}
        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          aria-label="Search levels"
          className="flex h-10 w-full items-center gap-2 rounded-btn border border-[#333333] bg-[#212121] px-3 text-text-tertiary md:hidden"
        >
          <Search size={16} />
          <span className="text-sm">Search levels…</span>
        </button>
      </div>

      <AvatarMenu />

      {overlayOpen && <SearchOverlay onClose={() => setOverlayOpen(false)} />}
    </header>
  )
}
