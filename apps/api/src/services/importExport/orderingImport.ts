// Resolving a spreadsheet ordering tab to the user's own completions.
//
// Shared by the two orderings the import can replace: the demon list and the
// MANUAL rating ranking. Both answer the same question — which of my completed
// classic levels is this row talking about, and in what order — and both apply
// the same rules to a row that names nothing, names something ambiguous, or
// names a level already placed higher up.
//
// Kept apart from either committer so the merge check and the commit resolve
// identically. A merge preview that disagreed with what the commit would write
// is worse than no preview.

import prisma from '../../utils/prisma'
import type { ImportRankingEntry } from '@infernolog/core'

/** Outcome of committing a spreadsheet's ordering tab. */
export interface ImportOrderingResult {
  placed: number
  skipped: { rank: number; label: string; reason: string }[]
}

export interface OrderingTargets {
  byLevelId: Map<string, string> // levelId -> levelProgressId
  byName: Map<string, string[]> // lowercased level name -> levelProgressId[]
  levelIdByLpId: Map<string, string> // levelProgressId -> levelId, for merge display
}

// Shared by commitImportRanking and checkRankingMerge — the user's completed
// classic levels, resolvable by levelId or (ambiguity-checked) by name.
//
// Scoped to CLASSIC to match what the demon list board itself offers: the
// platformer ranking is a separate list, and without this filter a Ranking tab
// naming a platformer completion would inject it into the classic demon list,
// where nothing downstream filters it back out. Non-demons are in scope — the
// classic demon list accepts them on every path (see services/demonList).
export async function resolveOrderingTargets(userId: string): Promise<OrderingTargets> {
  const completed = await prisma.levelProgress.findMany({
    where: {
      userId,
      progressUpdates: { some: { kind: 'COMPLETION' } },
      level: { levelType: 'CLASSIC' },
    },
    select: { id: true, levelId: true, level: { select: { name: true } } },
  })

  const byLevelId = new Map(completed.map((c) => [c.levelId, c.id]))
  const byName = new Map<string, string[]>()
  const levelIdByLpId = new Map<string, string>()
  for (const c of completed) {
    levelIdByLpId.set(c.id, c.levelId)
    const n = c.level.name?.trim().toLowerCase()
    if (!n) continue
    const list = byName.get(n)
    if (list) list.push(c.id)
    else byName.set(n, [c.id])
  }

  return { byLevelId, byName, levelIdByLpId }
}

// Resolves entries to an ordered list of levelProgressIds, skipping any entry
// that's ambiguous, unresolvable, or a duplicate of an already-ranked-higher
// entry — the exact same rules the committers enforce, shared so
// each ordering's merge check diffs against the order that would actually be
// written.
export function resolveOrderingOrder(
  targets: OrderingTargets,
  entries: ImportRankingEntry[]
): { orderedLpIds: string[]; skipped: ImportOrderingResult['skipped'] } {
  const skipped: ImportOrderingResult['skipped'] = []
  const orderedLpIds: string[] = []
  const seen = new Set<string>()

  entries.forEach((entry, i) => {
    const rank = i + 1
    const label =
      entry.levelName ??
      (entry.levelId ? `level ${entry.levelId}` : `rank ${rank}`)

    let lpId = entry.levelId ? targets.byLevelId.get(entry.levelId) : undefined
    if (!lpId && entry.levelName) {
      const matches = targets.byName.get(entry.levelName.trim().toLowerCase())
      if (matches && matches.length === 1) lpId = matches[0]
      else if (matches && matches.length > 1) {
        skipped.push({
          rank,
          label,
          reason:
            'Matches more than one of your completed levels — add a level_id',
        })
        return
      }
    }
    if (!lpId) {
      skipped.push({
        rank,
        label,
        reason:
          'Not among your completed classic levels — rank only applies to classic completions',
      })
      return
    }
    if (seen.has(lpId)) {
      skipped.push({
        rank,
        label,
        reason: 'Duplicate — this level is already ranked higher up',
      })
      return
    }
    seen.add(lpId)
    orderedLpIds.push(lpId)
  })

  return { orderedLpIds, skipped }
}

