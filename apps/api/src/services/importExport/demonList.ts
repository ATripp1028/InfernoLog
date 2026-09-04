// Ranking import — replaces the user's classic demon list with an ordered list.
//
// Ranking is a total order with replace semantics: when the spreadsheet carries
// a ranking tab, that order becomes the user's ranking (the "sheet wins" rule).
// This runs as one dedicated call after the completion/drop batches commit, so
// every ranked level already exists as one of the user's completions.
//
// Ordering: ClassicDemonList.listIndex is higher = harder (the UI shows it
// DESC, #1 = hardest). The incoming entries are ordered hardest → easiest, so
// entry 0 gets the highest index. We assign plain integers 1..N — the same shape
// the inline renormalisation in services/demonList produces — since a full replace
// has no neighbours to bisect.
//
// This is a write path that touches ClassicDemonList.listIndex, so it emits an
// activity_log event like every other one (see services/activityLog). It emits
// ONE user-facing DEMON_LIST_BULK_REPLACE for the whole import — not N placements,
// which would bury every other event in the user's feed, and not the
// internal-only DEMON_LIST_REBALANCE, which is for a rewrite the user cannot see.
// A replace really does change the order they see, so it belongs in the feed;
// the per-level detail lives in the event's impact rows, for a reader that wants
// to expand it.

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import type { ImportRankingEntry, ImportListMerge } from '@infernolog/core'
import { computeListMerge } from '../../utils/listMerge'
import { readRankingSnapshot, recordRankingBulkReplace } from '../activityLog'
import {
  resolveOrderingOrder,
  resolveOrderingTargets,
  type ImportOrderingResult,
} from './orderingImport'

/** Outcome of committing a spreadsheet's Demon List tab. */
export type ImportRankingResult = ImportOrderingResult

/**
 * Replaces the user's classic demon list with the spreadsheet's ordering.
 *
 * Each sheet row is resolved to one of the user's completions; rows with no
 * matching completion are reported in `skipped` rather than failing the import.
 * Because a full replace has no neighbours to bisect against, indices are
 * written as evenly spaced integers — the same normalized state the inline
 * renormalisation produces.
 *
 * Emits one user-facing DEMON_LIST_BULK_REPLACE event carrying every entry's new
 * index, including a null-position row for anything the replace dropped out of
 * the demon list. See the module header for why one event and not N placements.
 *
 * @param userId - Internal user UUID.
 * @param entries - Validated Ranking-tab rows, hardest first.
 */
export async function commitImportRanking(
  userId: string,
  entries: ImportRankingEntry[]
): Promise<ImportRankingResult> {
  const targets = await resolveOrderingTargets(userId)
  const { orderedLpIds, skipped } = resolveOrderingOrder(targets, entries)
  const n = orderedLpIds.length

  // Only replace when at least one entry resolved — otherwise a ranking tab full
  // of unresolvable rows would silently wipe an existing ranking.
  if (n > 0) {
    await prisma.$transaction(async (tx) => {
      const before = await readRankingSnapshot(tx, userId)
      await tx.classicDemonList.deleteMany({ where: { userId } })
      await tx.classicDemonList.createMany({
        data: orderedLpIds.map((levelProgressId, i) => ({
          userId,
          levelProgressId,
          // Hardest (i = 0) gets the highest index; easiest gets 1.
          listIndex: new Prisma.Decimal(n - i),
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

  const targets = await resolveOrderingTargets(userId)
  const { orderedLpIds } = resolveOrderingOrder(targets, entries)
  if (orderedLpIds.length === 0) return null
  const importedLevelIds = orderedLpIds.map(
    (lpId) => targets.levelIdByLpId.get(lpId)!
  )

  const existing = await prisma.classicDemonList.findMany({
    where: { userId },
    orderBy: { listIndex: 'desc' }, // hardest first, matching the import convention
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
