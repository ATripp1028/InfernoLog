// Ranking import — replaces the user's classic ranking with an ordered list.
//
// Ranking is a total order with replace semantics: when the spreadsheet carries
// a ranking tab, that order becomes the user's ranking (the "sheet wins" rule).
// This runs as one dedicated call after the completion/drop batches commit, so
// every ranked level already exists as one of the user's completions.
//
// Ordering: ClassicRanking.rankingIndex is higher = harder (the UI shows it
// DESC, #1 = hardest). The incoming entries are ordered hardest → easiest, so
// entry 0 gets the highest index. We assign plain integers 1..N — the same shape
// the inline renormalisation in services/ranking produces — since a full replace
// has no neighbours to bisect.
//
// This is a write path that touches ClassicRanking.rankingIndex, so it emits an
// activity_log event like every other one (see services/activityLog). It emits
// ONE user-facing RANKING_BULK_REPLACE for the whole import — not N placements,
// which would bury every other event in the user's feed, and not the
// internal-only RANKING_REBALANCE, which is for a rewrite the user cannot see.
// A replace really does change the order they see, so it belongs in the feed;
// the per-level detail lives in the event's impact rows, for a reader that wants
// to expand it.

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import type { ImportRankingEntry, ImportListMerge } from '@infernolog/core'
import { computeListMerge } from '../../utils/listMerge'
import { readRankingSnapshot, recordRankingBulkReplace } from '../activityLog'

/** Outcome of committing a spreadsheet's Ranking tab. */
export interface ImportRankingResult {
  placed: number
  skipped: { rank: number; label: string; reason: string }[]
}

interface RankingTargets {
  byLevelId: Map<string, string> // levelId -> levelProgressId
  byName: Map<string, string[]> // lowercased level name -> levelProgressId[]
  levelIdByLpId: Map<string, string> // levelProgressId -> levelId, for merge display
}

// Shared by commitImportRanking and checkRankingMerge — the user's completed
// classic levels, resolvable by levelId or (ambiguity-checked) by name.
//
// Scoped to CLASSIC to match what the ranking board itself offers: the
// platformer ranking is a separate list, and without this filter a Ranking tab
// naming a platformer completion would inject it into the classic ranking,
// where nothing downstream filters it back out. Non-demons are in scope — the
// classic ranking accepts them on every path (see services/ranking).
async function resolveRankingTargets(userId: string): Promise<RankingTargets> {
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
// entry — the exact same rules commitImportRanking enforces, shared so
// checkRankingMerge diffs against the same resolved order that would
// actually be written.
function resolveRankingOrder(
  targets: RankingTargets,
  entries: ImportRankingEntry[]
): { orderedLpIds: string[]; skipped: ImportRankingResult['skipped'] } {
  const skipped: ImportRankingResult['skipped'] = []
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

/**
 * Replaces the user's classic ranking with the spreadsheet's ordering.
 *
 * Each sheet row is resolved to one of the user's completions; rows with no
 * matching completion are reported in `skipped` rather than failing the import.
 * Because a full replace has no neighbours to bisect against, indices are
 * written as evenly spaced integers — the same normalized state the inline
 * renormalisation produces.
 *
 * Emits one user-facing RANKING_BULK_REPLACE event carrying every entry's new
 * index, including a null-position row for anything the replace dropped out of
 * the ranking. See the module header for why one event and not N placements.
 *
 * @param userId - Internal user UUID.
 * @param entries - Validated Ranking-tab rows, hardest first.
 */
export async function commitImportRanking(
  userId: string,
  entries: ImportRankingEntry[]
): Promise<ImportRankingResult> {
  const targets = await resolveRankingTargets(userId)
  const { orderedLpIds, skipped } = resolveRankingOrder(targets, entries)
  const n = orderedLpIds.length

  // Only replace when at least one entry resolved — otherwise a ranking tab full
  // of unresolvable rows would silently wipe an existing ranking.
  if (n > 0) {
    await prisma.$transaction(async (tx) => {
      const before = await readRankingSnapshot(tx, userId)
      await tx.classicRanking.deleteMany({ where: { userId } })
      await tx.classicRanking.createMany({
        data: orderedLpIds.map((levelProgressId, i) => ({
          userId,
          levelProgressId,
          // Hardest (i = 0) gets the highest index; easiest gets 1.
          rankingIndex: new Prisma.Decimal(n - i),
        })),
      })
      const after = await readRankingSnapshot(tx, userId)
      await recordRankingBulkReplace(tx, userId, before, after)
    })
  }

  return { placed: n, skipped }
}

/**
 * Pre-commit merge check: diffs the sheet's resolvable order (hardest →
 * easiest, same rules commitImportRanking applies) against the user's
 * existing ranking via the git-like list merge (see utils/listMerge.ts).
 * Returns null whenever there's nothing to reconcile — no ranking tab, no
 * entries resolved, no existing ranking to conflict with, or the two orders
 * already agree — mirroring checkCollectionsMerge's "only surface a genuine
 * conflict" contract.
 */
export async function checkRankingMerge(
  userId: string,
  entries: ImportRankingEntry[]
): Promise<ImportListMerge | null> {
  if (entries.length === 0) return null

  const targets = await resolveRankingTargets(userId)
  const { orderedLpIds } = resolveRankingOrder(targets, entries)
  if (orderedLpIds.length === 0) return null
  const importedLevelIds = orderedLpIds.map(
    (lpId) => targets.levelIdByLpId.get(lpId)!
  )

  const existing = await prisma.classicRanking.findMany({
    where: { userId },
    orderBy: { rankingIndex: 'desc' }, // hardest first, matching the import convention
    select: { levelProgress: { select: { levelId: true } } },
  })
  const existingLevelIds = existing.map((r) => r.levelProgress.levelId)

  const merge = computeListMerge(existingLevelIds, importedLevelIds)
  if (!merge.hasConflict) return null

  const allLevelIds = new Set([...existingLevelIds, ...importedLevelIds])
  const levels = await prisma.level.findMany({
    where: { inGameId: { in: [...allLevelIds] } },
    select: { inGameId: true, name: true },
  })
  const nameById = new Map(levels.map((l) => [l.inGameId, l.name]))
  const toEntries = (ids: string[]) =>
    ids.map((id) => ({ levelId: id, levelName: nameById.get(id) ?? null }))

  return {
    list: null,
    mergedSeed: toEntries(merge.mergedSeed),
    importedRemainder: toEntries(merge.importedRemainder),
    existingRemainder: toEntries(merge.existingRemainder),
    hasConflict: merge.hasConflict,
    importedOrder: toEntries(importedLevelIds),
    existingOrder: toEntries(existingLevelIds),
  }
}
