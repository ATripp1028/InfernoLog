// Rating-ranking import — replaces the user's MANUAL rating order with an
// ordered list.
//
// The deliberate twin of importExport/demonList, on the other axis: that one
// replaces the difficulty ordering, this the quality one. Both resolve their
// rows through orderingImport, so a row that names an ambiguous or unfinished
// level is treated identically either way.
//
// Replace semantics, like the demon list: when the workbook carries a Ranking
// tab, that order becomes the user's ranking. Indices are plain integers 1..N
// — the same normalised state the inline renormalisation produces — since a
// full replace has no neighbours to bisect against.
//
// This touches RatingRanking.ratingIndex, so it emits an activity_log event
// like every other write path: ONE user-facing RATING_BULK_REPLACE for the
// whole import rather than N placements, which would bury every other event in
// the feed. The per-level detail lives in the event's impact rows.
//
// Applies whatever the user's rating mode: importing an order for a SIMPLE-mode
// user stores it against the day they switch to MANUAL, exactly as switching
// modes preserves the scores of the mode they left.

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import type { ImportRankingEntry, ImportListMerge } from '@infernolog/core'
import { computeListMerge } from '../../utils/listMerge'
import { readRatingSnapshot, recordRankingBulkReplace } from '../activityLog'
import {
  resolveOrderingOrder,
  resolveOrderingTargets,
  type ImportOrderingResult,
} from './orderingImport'

/** Outcome of committing a spreadsheet's Ranking tab. */
export type ImportRatingRankingResult = ImportOrderingResult

/**
 * Replaces the user's MANUAL rating order with the spreadsheet's ordering.
 *
 * Rows with no matching completion are reported in `skipped` rather than
 * failing the import.
 *
 * @param userId - Internal user UUID.
 * @param entries - Validated Ranking-tab rows, best first.
 */
export async function commitImportRatingRanking(
  userId: string,
  entries: ImportRankingEntry[]
): Promise<ImportRatingRankingResult> {
  const targets = await resolveOrderingTargets(userId)
  const { orderedLpIds, skipped } = resolveOrderingOrder(targets, entries)
  const n = orderedLpIds.length

  // Only replace when at least one entry resolved — otherwise a tab full of
  // unresolvable rows would silently wipe an existing ranking.
  if (n > 0) {
    await prisma.$transaction(async (tx) => {
      const before = await readRatingSnapshot(tx, userId)
      await tx.ratingRanking.deleteMany({ where: { userId } })
      await tx.ratingRanking.createMany({
        data: orderedLpIds.map((levelProgressId, i) => ({
          userId,
          levelProgressId,
          // Best (i = 0) gets the highest index; worst gets 1.
          ratingIndex: new Prisma.Decimal(n - i),
        })),
      })
      const after = await readRatingSnapshot(tx, userId)
      await recordRankingBulkReplace(tx, userId, before, after, 'RATING_BULK_REPLACE')
    })
  }

  return { placed: n, skipped }
}

/**
 * Pre-commit merge check: diffs the sheet's resolvable order against the user's
 * existing rating ranking via the git-like list merge (see utils/listMerge).
 *
 * Returns null whenever there is nothing to reconcile — no tab, nothing
 * resolved, no existing order to conflict with, or the two already agree —
 * mirroring the demon list's contract of only surfacing a genuine conflict.
 */
export async function checkRatingRankingMerge(
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

  const existing = await prisma.ratingRanking.findMany({
    where: { userId },
    orderBy: { ratingIndex: 'desc' }, // best first, matching the import convention
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
