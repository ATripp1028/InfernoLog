import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { AvatarMenu } from './AvatarMenu'
import { Logo } from './Logo'
import { DifficultyFace } from './DifficultyFace'
import { useMyProgress, type LevelProgressListItem } from '@/lib/api/list'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { cn } from '@/lib/utils'

// Mirrors NAME_COLOR in features/list/LevelCell.tsx: gold = completed, white =
// in progress, red = dropped.
const NAME_COLOR: Record<LevelProgressListItem['status'], string> = {
  COMPLETED: 'text-[#ff9f1c]',
  IN_PROGRESS: 'text-text-primary',
  DROPPED: 'text-danger',
}

const MAX_RESULTS = 8

export function AppHeader() {
  const navigate = useNavigate()
  const { data } = useMyProgress()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !data) return []
    return data
      .filter((item) => item.level.name?.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = a.level.name!.toLowerCase()
        const bName = b.level.name!.toLowerCase()
        const aStarts = aName.startsWith(q)
        const bStarts = bName.startsWith(q)
        if (aStarts !== bStarts) return aStarts ? -1 : 1
        return aName.length - bName.length
      })
      .slice(0, MAX_RESULTS)
  }, [data, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

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

  function selectResult(item: LevelProgressListItem) {
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
    void navigate({
      to: '/list/$levelId',
      params: { levelId: item.level.inGameId },
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = results[activeIndex]
      if (selected) selectResult(selected)
    }
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-subtle bg-bg-surface px-4 xl:px-6">
      <div className="xl:hidden">
        <Logo variant="icon" />
      </div>
      <div className="hidden xl:block">
        <Logo variant="full" />
      </div>

      <div className="relative flex-1" ref={containerRef}>
        <div className="flex h-10 items-center gap-2 rounded-btn border border-border bg-bg-elevated px-3 text-text-tertiary">
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
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
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
              className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-card border border-border bg-bg-elevated shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            >
              {results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-text-tertiary">
                  No logged levels match &quot;{query.trim()}&quot;
                </p>
              ) : (
                results.map((item, index) => (
                  <SearchResultRow
                    key={item.levelProgressId}
                    item={item}
                    active={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onSelect={() => selectResult(item)}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AvatarMenu />
    </header>
  )
}

function SearchResultRow({
  item,
  active,
  onMouseEnter,
  onSelect,
}: {
  item: LevelProgressListItem
  active: boolean
  onMouseEnter: () => void
  onSelect: () => void
}) {
  const { level } = item
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
      className="relative flex h-14 w-full cursor-pointer items-center gap-3 overflow-hidden border-b border-border-subtle px-3 text-left transition-colors last:border-b-0"
    >
      {/* Level thumbnail backdrop; hidden if it fails to load. */}
      <img
        src={levelThumbnailUrl(level.inGameId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className="absolute inset-0 size-full object-cover"
      />
      {/* Scrim for legibility, plus the hover/active highlight. */}
      <span className="absolute inset-0 bg-gradient-to-r from-bg-elevated/95 via-bg-elevated/85 to-bg-elevated/55" />
      <span
        className={cn(
          'absolute inset-0 transition-colors',
          active ? 'bg-white/10' : 'bg-white/0'
        )}
      />

      <span className="relative flex min-w-0 flex-1 items-center gap-3">
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={80}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium leading-tight',
              NAME_COLOR[item.status]
            )}
          >
            {level.name ?? `Level #${level.inGameId}`}
          </span>
          <span className="block truncate text-xs text-text-secondary">
            by {level.creator ?? 'Unknown'}
          </span>
        </span>
      </span>
    </button>
  )
}
