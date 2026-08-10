// Shared "seeded confirmation" card for a level resolved from RobTop by
// numeric ID — AddLevelsDialog and AddToCollectionDialog both hold the
// fetched level for confirmation (rather than adding/picking it immediately)
// since the user typed a raw ID with no name visible yet.
import { DifficultyFace } from '@/components/DifficultyFace'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { cn } from '@/lib/utils'

import { SectionLabel } from '@/components/SectionLabel'

/**
 * The level fields the preview card renders. A subset of `Level`, so a search result satisfies it too.
 */
/**
 * The level fields the preview card renders, and the shape both collection
 * dialogs pass around for a level picked or resolved by id. A subset of
 * `Level`, so a search result satisfies it too.
 */
export interface SeededLevelPreviewData {
  inGameId: string
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
}

/**
 * Confirmation card for a level resolved from RobTop by numeric id, held for confirmation because the user typed a raw id with no name visible.
 */
/**
 * A {@link SeededLevelPreviewData} plus whether the user has already beaten
 * it — what both dialogs hold while a by-id resolve awaits confirmation.
 */
export interface SeededLevel extends SeededLevelPreviewData {
  completed: boolean
}

export function SeededLevelPreviewCard({
  level,
  badge,
  dimmed,
  description,
  onChange,
}: {
  level: SeededLevelPreviewData
  // Shown as a shrunk pill in the row — e.g. "Added" / "Already completed".
  // Omitted (undefined/null) when the level has no blocking state yet.
  badge?: string | null
  dimmed?: boolean
  description: React.ReactNode
  onChange: () => void
}) {
  return (
    <div>
      <SectionLabel tone="secondary" className="mb-2">
        Selected
      </SectionLabel>
      <div
        className={cn(
          'relative flex items-center gap-3 overflow-hidden rounded-btn border border-border bg-bg-surface px-4 py-3.5',
          dimmed && 'opacity-60'
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
        <span className="absolute inset-0 bg-gradient-to-r from-bg-base/95 via-bg-base/85 to-bg-base/55" />
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={72}
          className="relative drop-shadow"
        />
        <span className="relative min-w-0 flex-1">
          <span className="block truncate font-semibold text-text-primary">
            {level.name ?? `Level #${level.inGameId}`}
          </span>
          <span className="block truncate text-[13px] text-text-secondary">
            {[
              level.creator ? `by ${level.creator}` : null,
              level.inGameDifficulty,
              `#${level.inGameId}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {badge && (
          <span className="relative shrink-0 rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
            {badge}
          </span>
        )}
        <button
          type="button"
          onClick={onChange}
          className="relative shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Change
        </button>
      </div>
      <p className="mt-3 text-sm text-text-secondary">{description}</p>
    </div>
  )
}
