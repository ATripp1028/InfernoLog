import type {
  ClassicRankingEntry,
  UnplacedRankingEntry,
  LevelListSummary,
} from '@infernolog/core'

// Search matches level name, creator, or in-game id — same fields the list
// page searches.
function matchesLevel(level: LevelListSummary, q: string): boolean {
  return (
    (level.name?.toLowerCase().includes(q) ?? false) ||
    (level.creator?.toLowerCase().includes(q) ?? false) ||
    level.inGameId.toLowerCase().includes(q)
  )
}

// The displayed ranked list. `showUnrated` off hides in-game-unrated levels and
// renumbers the remaining rows contiguously ("ranking numbers update for that
// view" — RANKING_SYSTEM.md). Search then hides non-matches but keeps those
// view numbers. The authoritative order/ranks for reordering stay on the
// untouched query data (reorder is disabled while either is active).
export function filterPlaced(
  placed: ClassicRankingEntry[],
  query: string,
  showUnrated: boolean
): ClassicRankingEntry[] {
  const base = showUnrated ? placed : placed.filter((e) => e.level.isRated)
  const numbered =
    base.length === placed.length
      ? base
      : base.map((e, i) => (e.rank === i + 1 ? e : { ...e, rank: i + 1 }))

  const q = query.trim().toLowerCase()
  if (!q) return numbered
  return numbered.filter((e) => matchesLevel(e.level, q))
}

export function filterUnplaced(
  unplaced: UnplacedRankingEntry[],
  query: string
): UnplacedRankingEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return unplaced
  return unplaced.filter((e) => matchesLevel(e.level, q))
}

// Drag reordering is disabled whenever rows are actually hidden — a search is
// active, or the "Show unrated" toggle removed some rows — because a row's
// position relative to the hidden ones is ambiguous. "Show unrated" off with no
// unrated levels present hides nothing, so dragging stays enabled by default.
export function reorderDisabled(
  placedCount: number,
  viewCount: number,
  query: string
): boolean {
  return query.trim() !== '' || viewCount !== placedCount
}
