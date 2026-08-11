// The level search-result row shared by every "pick a level" surface: the
// logging flow's FindLevelStep, and the two collections dialogs. Thumbnail
// backdrop, gradient scrim for legibility, hover lift, difficulty face,
// name + `by creator · song` meta, and a right-hand slot that shows the
// level's ID unless the caller supplied a status badge.
//
// Callers differ only in that right-hand slot and in whether the row can be
// clicked — the layout itself is identical everywhere, so it lives here
// rather than being re-typed per feature.
//
// Not to be confused with the search page's SearchResultRow, which is a
// genuinely different (shorter, ThumbnailWash-based, listbox-option) design.

import { Loader2 } from 'lucide-react'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { levelThumbnailUrl } from '@/lib/gdAssets'

/**
 * The subset of a level this row renders. Structural on purpose: `Level`,
 * `LevelSearchResult` and the collections dialogs' own picked-level shapes
 * all satisfy it without conversion.
 */
export interface LevelResultRowLevel {
  inGameId: string
  name: string | null
  creator: string | null
  songName: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
}

/**
 * A selectable level row for any "pick a level" prompt — the logging flow's
 * find step and both collection dialogs.
 *
 * Per-caller differences are props, not copies: `badge` labels a blocked
 * state ("Added", "Already completed"), `loading` and `disabled` grey the row
 * out while a write is in flight. Deliberately distinct from
 * `SearchResultRow`, which answers to the search surface rather than a
 * picker; see docs/CODE_QUALITY.md, Frontend §3.
 */
export function LevelResultRow({
  level,
  onSelect,
  badge = null,
  loading = false,
  disabled = false,
}: {
  level: LevelResultRowLevel
  onSelect: () => void
  // Replaces the level ID on the right when set ("Added", "Already logged",
  // "Already beaten") — a badge always means the row is not actionable, so
  // it disables the row too.
  badge?: string | null
  // In-flight indicator for a row-scoped action (e.g. adding to a
  // collection); takes the right-hand slot while true.
  loading?: boolean
  // Blocks selection for a reason not specific to this row — typically
  // another row's action being in flight.
  disabled?: boolean
}) {
  const meta = [level.creator ? `by ${level.creator}` : null, level.songName]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      disabled={badge != null || disabled}
      onClick={onSelect}
      className="group relative flex h-16 w-full items-center justify-between gap-3 overflow-hidden border-b border-border-subtle bg-bg-surface px-4 text-left transition-colors last:border-b-0 disabled:opacity-60"
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
      {/* Scrim for legibility + a subtle hover lift. */}
      <span className="absolute inset-0 bg-gradient-to-r from-bg-base/95 via-bg-base/85 to-bg-base/55" />
      <span className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/5" />

      <span className="relative flex items-center gap-3">
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={100}
          className="translate-y-[3px] drop-shadow"
        />
        <span>
          <span className="block font-medium leading-tight text-text-primary">
            {level.name ?? `Level #${level.inGameId}`}
          </span>
          {meta && (
            <span className="block text-xs text-text-secondary">{meta}</span>
          )}
        </span>
      </span>

      {loading ? (
        <Loader2
          size={16}
          className="relative animate-spin text-text-tertiary"
        />
      ) : badge != null ? (
        <span className="relative rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
          {badge}
        </span>
      ) : (
        <span className="relative font-mono text-xs text-text-secondary">
          #{level.inGameId}
        </span>
      )}
    </button>
  )
}
