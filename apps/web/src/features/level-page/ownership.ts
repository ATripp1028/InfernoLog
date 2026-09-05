// Whether the viewer owns an entry for the level being viewed, and whether
// that entry is beaten. Both come from the level query once it lands — but
// the FAB needs them on the first frame, so until then the cached Log row
// answers instead. Pure; `useLevelDetailPage` owns the sourcing.

import type { LevelPageData } from '@/lib/api/levelPage'
import type { LevelProgressListItem } from '@/lib/api/log'

/** What the FAB needs to know to pick its action set. */
export interface LevelOwnership {
  isOwner: boolean
  hasCompletion: boolean
}

/**
 * Ownership of a level, resolved from the best source currently available.
 *
 * The level query is authoritative and wins as soon as it settles. Before
 * that the cached Log row stands in: its presence is ownership, and
 * `status === 'COMPLETED'` holds exactly when the level has a COMPLETION
 * update (the API keeps the two in lockstep — see `services/progress`), so
 * it answers both questions the FAB asks.
 *
 * Returns `null` when neither source can answer yet — a cold load with no
 * persisted Log. Callers should render the FAB disabled rather than guess,
 * since guessing wrong means swapping the action set out from under a tap.
 */
export function resolveLevelOwnership(sources: {
  // Whether the level query has settled — data or error, either is an answer.
  levelQuerySettled: boolean
  levelData: LevelPageData | undefined
  // Whether the Log is in cache at all, distinct from whether it holds a row.
  logCached: boolean
  logRow: LevelProgressListItem | undefined
}): LevelOwnership | null {
  const { levelQuerySettled, levelData, logCached, logRow } = sources

  if (levelQuerySettled) {
    const isOwner = levelData?.levelProgressId != null
    return {
      isOwner,
      hasCompletion:
        isOwner &&
        (levelData?.progressUpdates.some((u) => u.kind === 'COMPLETION') ??
          false),
    }
  }

  if (!logCached) return null

  return {
    isOwner: logRow != null,
    hasCompletion: logRow?.status === 'COMPLETED',
  }
}
