// The Log page's level filter: a search box over the user's own levels.
//
// A plain Select was the wrong control here — a few hundred entries is more
// than a dropdown can be scanned, and the user knows the name of the level they
// want. Suggestions use LevelResultRow, the same row every other "pick a level"
// surface renders, so a level looks the same here as it does in the logging
// flow's find step: thumbnail wash, difficulty face, name and creator.

import { useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/generic/popover'
import { LevelResultRow } from '@/components/data/LevelResultRow'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { cn } from '@/lib/utils'
import { matchLevels, type LevelOption } from './eventFilters'

/**
 * The chosen level, shown in place of the search box.
 *
 * Carries its own thumbnail wash so the selected state reads as the same kind
 * of object as the suggestions it was picked from, rather than as a text value
 * that happens to be a level name.
 */
function SelectedLevel({
  level,
  onClear,
}: {
  level: LevelOption
  onClear: () => void
}) {
  return (
    <div className="relative flex h-8 w-[300px] items-center gap-2 overflow-hidden rounded border border-border bg-bg-elevated pl-1.5 pr-7">
      <img
        src={levelThumbnailUrl(level.levelId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className="absolute inset-0 size-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-r from-bg-base/95 via-bg-base/85 to-bg-base/60" />
      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={48}
        className="relative shrink-0 drop-shadow"
      />
      <span className="relative min-w-0">
        <span className="block truncate text-xs font-medium leading-tight text-text-primary">
          {level.name ?? `Level #${level.levelId}`}
        </span>
        {level.creator && (
          <span className="block truncate text-[10px] leading-tight text-text-secondary">
            by {level.creator}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear level filter"
        className="absolute right-1.5 rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  )
}

/**
 * Search-and-pick for the level filter.
 *
 * @param options - Every level the user has logged. Filtering happens in the
 * browser: this is their own list, already loaded for the page, so a round trip
 * per keystroke would buy nothing.
 * @param selected - The chosen level, or null for "All levels".
 */
export function LevelFilterBox({
  options,
  selected,
  onSelect,
}: {
  options: LevelOption[]
  selected: LevelOption | null
  onSelect: (levelId: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  if (selected) {
    return (
      <SelectedLevel
        level={selected}
        onClear={() => {
          onSelect(null)
          setQuery('')
        }}
      />
    )
  }

  const suggestions = matchLevels(options, query)

  function choose(levelId: string) {
    onSelect(levelId)
    setQuery('')
    setOpen(false)
  }

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className="relative flex h-8 w-[240px] items-center"
        >
          <Search
            className="absolute left-2 h-3.5 w-3.5 text-text-tertiary"
            aria-hidden
          />
          <input
            value={query}
            placeholder="All levels"
            aria-label="Filter by level"
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              // Enter picks the top suggestion, so a user who typed the whole
              // name never has to reach for the mouse to confirm it.
              if (e.key === 'Enter' && suggestions[0]) {
                e.preventDefault()
                choose(suggestions[0].levelId)
              }
            }}
            className={cn(
              'h-8 w-full rounded border border-border bg-bg-elevated pl-7 pr-2 text-xs text-text-primary',
              'outline-none transition-colors placeholder:text-text-tertiary focus:border-primary'
            )}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[320px] overflow-hidden p-0"
        // Focus must stay in the box while the list is open, or typing the
        // second character would close it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // The click that opens the list is a pointerdown on the input, which
        // sits OUTSIDE the popover content — so Radix's dismiss layer read it
        // as a click-away and closed the list on the same gesture that opened
        // it, which showed as a flash. Interactions inside the anchor are the
        // box's own business.
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
        // Likewise for focus: focusing the input is what opens the list.
        onFocusOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
      >
        <div className="max-h-[320px] overflow-y-auto">
          {suggestions.map((option) => (
            <LevelResultRow
              key={option.levelId}
              level={{
                inGameId: option.levelId,
                name: option.name,
                creator: option.creator,
                songName: option.songName,
                inGameDifficulty: option.inGameDifficulty,
                featured: option.featured,
                epicValue: option.epicValue,
                isRated: option.isRated,
              }}
              compact
              onSelect={() => choose(option.levelId)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
