import { DifficultyFace } from '@/components/DifficultyFace'
import { ThumbnailWash } from '@/features/ranking/ThumbnailWash'
import { cn } from '@/lib/utils'

// The minimal level shape a search row renders. Both LevelSearchResult (cache
// search) and the full Level (id resolve / GD escalation) satisfy it.
export interface SearchRowLevel {
  inGameId: string
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  isRated: boolean
  featured?: boolean | null
  epicValue?: number | null
}

interface SearchResultRowProps {
  level: SearchRowLevel
  onSelect: () => void
  /** Highlighted via keyboard nav (desktop dropdown). */
  active?: boolean
  onMouseEnter?: () => void
  /** Mobile overlay sizing (11px meta, 24px face) vs desktop. */
  compact?: boolean
  /** Unrated GD results render dimmed (see the escalation results view). */
  dimmed?: boolean
}

// A single search-result row. Uses the same level-thumbnail wash as the list,
// ranking, and collection entries (the shared ThumbnailWash) so search reads as
// part of the same surface, with the load-bearing `creator · ID · difficulty`
// triple over it (reuploads and remakes share names, so the triple is how a
// user tells them apart). Used by both the desktop toolbar dropdown and the
// mobile overlay.
export function SearchResultRow({
  level,
  onSelect,
  active = false,
  onMouseEnter,
  compact = false,
  dimmed = false,
}: SearchResultRowProps) {
  const difficulty = level.inGameDifficulty ?? 'Unrated'
  const meta = `by ${level.creator ?? 'Unknown'} · ${level.inGameId} · ${difficulty}`

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
      className={cn(
        'group relative flex h-14 w-full items-center gap-3 overflow-hidden text-left',
        compact ? 'px-4' : 'px-3',
        dimmed && 'opacity-70'
      )}
    >
      <ThumbnailWash levelId={level.inGameId} variant="row" />
      {/* Hover / keyboard-active tint, above the wash. */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 transition-colors',
          active ? 'bg-white/[0.08]' : 'bg-white/0 group-hover:bg-white/[0.04]'
        )}
      />

      <span className="relative z-10 min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm font-medium leading-tight',
            dimmed ? 'text-[#cccccc]' : 'text-text-primary'
          )}
        >
          {level.name ?? `Level #${level.inGameId}`}
        </span>
        <span
          className={cn(
            'block truncate text-text-secondary',
            compact ? 'text-[11px]' : 'text-xs'
          )}
        >
          {meta}
        </span>
      </span>

      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured ?? null}
        epicValue={level.epicValue ?? null}
        rated={level.isRated}
        size={compact ? 24 : 28}
        className="relative z-10 shrink-0"
      />
    </button>
  )
}
