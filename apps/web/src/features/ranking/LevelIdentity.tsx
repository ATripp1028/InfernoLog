import { DifficultyFace } from '@/components/data/DifficultyFace'
import { FACE_SIZE } from './columns'
import type { LevelProgressListItem } from '@infernolog/core'

/**
 * The left-hand half of a ranked row: the level's face, its position, its name
 * and its creator.
 *
 * Shared by the row's two modes so the same markup renders in both. That keeps
 * the face and the name from being torn down and rebuilt when the editor opens
 * — and, read together with the row keeping its thumbnail mounted, means
 * opening the editor refetches nothing.
 */
export function LevelIdentity({
  rank,
  level,
  nameColor,
}: {
  /**
   * The level's position, or null where it has none — the unranked pile and the
   * drag overlay, which show the same identity block without a number in front
   * of it.
   */
  rank: number | null
  level: LevelProgressListItem['level']
  /** From `overallColor` — the rating's colour, which the name shares. */
  nameColor: string | undefined
}) {
  return (
    <>
      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={FACE_SIZE}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-semibold text-text-primary"
          style={{ color: nameColor }}
        >
          {rank === null ? '' : `#${rank} — `}
          {level.name ?? `Level #${level.inGameId}`}
        </div>
        <div className="truncate text-xs text-text-secondary">
          {level.creator ? `Published by ${level.creator}` : 'Unknown creator'}
        </div>
      </div>
    </>
  )
}
