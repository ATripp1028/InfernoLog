import { DifficultyFace } from '@/components/DifficultyFace'
import { levelThumbnailUrl } from '@/lib/gdAssets'
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
  /** Mobile overlay sizing (56×32 thumb, 11px meta, 24px face) vs desktop. */
  compact?: boolean
  /** Unrated GD results render dimmed (see the escalation results view). */
  dimmed?: boolean
}

// A single search-result row: level thumbnail, name, and the load-bearing
// `creator · ID · difficulty` triple (reuploads and remakes share names, so the
// triple is how a user tells them apart), with the difficulty face right-
// aligned. Used by both the desktop toolbar dropdown and the mobile overlay.
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
        'flex h-14 w-full items-center gap-3 text-left transition-colors',
        compact ? 'px-4' : 'px-3',
        active ? 'bg-white/[0.06]' : 'bg-transparent hover:bg-white/[0.03]',
        dimmed && 'opacity-70'
      )}
    >
      <span
        className={cn(
          'relative shrink-0 overflow-hidden rounded bg-black',
          compact ? 'h-8 w-14' : 'h-9 w-16'
        )}
      >
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
        <span className="absolute inset-0 bg-[#3a1a10]/40" />
      </span>

      <span className="min-w-0 flex-1">
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
        className="shrink-0"
      />
    </button>
  )
}
