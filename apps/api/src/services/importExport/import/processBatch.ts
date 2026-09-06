// The batch commit itself — turns a page of pending ImportJobRows into the
// planned writes and flushes them, then records each row's outcome in place.
//
// processImportJobBatch is what the worker Lambda calls per batch;
// commitImportBatch is the single-shot wrapper used by in-process callers.

// Spreadsheet import service — commit logic for POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop
// writes, cross-tab reconciliation (completion + drop for same level),
// conflict resolution, idempotency via (importJobId, rowIndex) keys,
// name-based level resolution, and GDDL tier autofill.

import { randomUUID } from 'node:crypto'
import prisma from '../../../utils/prisma'
import type { Prisma } from '@prisma/client'
import type { ImportCommitRow, ImportCommitResponse } from '@infernolog/core'
import { logger } from '../../../utils/logger'
import { type RobtopLevel } from '../../../utils/robtop'
import { buildRobtopRefreshData } from '../../levels/robtopMapping'
import { resolveLevelDifficulty } from '../../levels/difficulty'
import { fetchGddlTier } from '../../../utils/gddl'
import { removeFromWantToBeat } from '../../collections'
import {
  enqueueSeedIds,
  ensureStubLevels,
  resolveByName,
} from './levelResolution'
import {
  deriveEventKey,
  fetchExistingEvents,
  groupByLevel,
  isoDate,
  planDrop,
  planProgress,
} from './planEvents'
import {
  LpPlan,
  LpStatus,
  PlanCtx,
  completionOutcomeReason,
  newBatchWrites,
  planCompletion,
} from './planWrites'

// ── Main commit function ───────────────────────────────────────────────────
//
// Processes one batch of a background ImportJob's rows. Rows are pre-inserted
// as ImportJobRow("pending") by POST /v1/me/import/start; this function is
// called by the worker Lambda (importWorker.ts) with the next up-to-50
// pending rows fetched from the DB, and writes each row's final outcome back
// in place (update, not create) — there is no separate idempotency table
// anymore, since only the worker (never the client) drives this.

/**
 * Processes one batch of spreadsheet rows into progress records.
 *
 * The whole batch is planned before anything is written: levels are resolved
 * (by id, or by name via RobTop), existing entries are diffed to decide
 * create-vs-overwrite-vs-skip, and the resulting writes are then flushed in one
 * short transaction. Keeping the planning outside the transaction is what stops
 * a batch full of network-bound level lookups from holding a DB transaction
 * open. Rows that can't be resolved, or that conflict, are returned as outcomes
 * for the review UI rather than failing the batch.
 *
 * @param userId - Internal user UUID.
 * @param importJobId - The owning ImportJob.
 * @param pendingRows - This batch's rows, with their DB ids for outcome writes.
 * @returns Per-row outcomes and the ids of any stub levels created, which the
 * worker enqueues for seeding.
 */
export async function processImportJobBatch(
  userId: string,
  importJobId: string,
  pendingRows: { id: string; rowIndex: number; rawData: ImportCommitRow }[]
): Promise<ImportCommitResponse> {
  const rows = pendingRows.map((r) => r.rawData)
  const rowDbId = new Map(pendingRows.map((r) => [r.rowIndex, r.id]))

  // ── Pre-resolve name-only rows (outside the transaction) ──────────────
  // Resolving via RobTop involves network I/O that must not hold a DB
  // transaction open.
  const resolvedIds = new Map<number, string>() // rowIndex → levelId
  const resolvedRobtopData = new Map<string, RobtopLevel>() // levelId → full data
  const resolutionFailures = new Map<number, string>() // rowIndex → reason

  const nameOnlyRows = rows.filter((r) => !r.data.levelId && r.data.levelName)
  for (const row of nameOnlyRows) {
    // Both tabs carry in_game_difficulty purely to disambiguate name resolution.
    const result = await resolveByName(
      row.data.levelName!,
      row.data.creator,
      row.data.inGameDifficulty
    )
    if (result === 'ambiguous') {
      resolutionFailures.set(
        row.rowIndex,
        `Ambiguous: multiple levels match "${row.data.levelName}"; add a creator column to disambiguate`
      )
    } else if (result === null) {
      resolutionFailures.set(
        row.rowIndex,
        `Level not found: "${row.data.levelName}" did not match any level on GD servers`
      )
    } else {
      resolvedIds.set(row.rowIndex, result.levelId)
      if (result.robtopLevel)
        resolvedRobtopData.set(result.levelId, result.robtopLevel)
    }
  }

  // ── Pre-fetch GDDL tiers in parallel (outside the transaction) ────────
  const gddlTierCache = new Map<string, number | null>()
  const completionRows = rows.filter(
    (r) => r.type === 'completion' && !r.data.userGddlTier
  )
  const idsNeedingGddl = [
    ...new Set(
      completionRows
        .map((r) => r.data.levelId ?? resolvedIds.get(r.rowIndex))
        .filter((id): id is string => !!id)
    ),
  ]
  await Promise.all(
    idsNeedingGddl.map(async (id) => {
      gddlTierCache.set(id, await fetchGddlTier(id))
    })
  )

  const allKnownIds = [
    ...new Set([
      ...rows.filter((r) => r.data.levelId).map((r) => r.data.levelId!),
      ...resolvedIds.values(),
    ]),
  ]

  // ── Pre-fetch existing state (batched, outside the transaction) ───────
  // Two findMany calls replace the per-row reads the old per-row commit did,
  // so the transaction below only has to issue writes.
  const lpRows = await prisma.levelProgress.findMany({
    where: { userId, levelId: { in: allKnownIds } },
    select: {
      id: true,
      levelId: true,
      status: true,
      visibility: true,
      progressUpdates: {
        where: { kind: 'COMPLETION' },
        // The date comes back too: it is the line a progress row may not be
        // dated past (see completionDateByLevel below).
        select: { id: true, date: true, dateTimezone: true },
        take: 1,
      },
    },
  })
  const dbState = new Map(
    lpRows.map((r) => [
      r.levelId,
      {
        id: r.id,
        status: r.status as LpStatus,
        completionId: r.progressUpdates[0]?.id ?? null,
        visibility: r.visibility as 'PUBLIC' | 'PRIVATE',
      },
    ])
  )
  // levelId → the stored completion's calendar day, read back through its own
  // timezone so it is the day the user entered.
  const storedCompletionDate = new Map<string, string | null>(
    lpRows.flatMap((r) => {
      const pu = r.progressUpdates[0]
      return pu ? [[r.levelId, isoDate(pu.date, pu.dateTimezone)] as const] : []
    })
  )

  const levelRows = await prisma.level.findMany({
    where: { inGameId: { in: allKnownIds } },
    // stars is canonical for a non-demon, so the snapshot has to be resolved
    // rather than read straight off the (display-copy) label column.
    select: {
      inGameId: true,
      inGameDifficulty: true,
      stars: true,
      coins: true,
    },
  })
  const levelDiff = new Map<string, string | null>(
    levelRows.map((l) => [l.inGameId, resolveLevelDifficulty(l)])
  )
  const levelCoins = new Map<string, number | null>(
    levelRows.map((l) => [l.inGameId, l.coins])
  )
  // Name-resolved levels are created/enriched as stubs below; surface their
  // RobTop difficulty + coin count now for the completion snapshot / coin gate.
  for (const [id, rt] of resolvedRobtopData) {
    levelDiff.set(id, resolveLevelDifficulty({ ...rt, inGameId: id }))
    levelCoins.set(id, rt.coins)
  }

  // ── Pre-fetch existing progress entries referenced by progress_id ─────
  // Scoped to this user via the levelProgress relation filter, so a foreign
  // or stale id can never be used to update someone else's data.
  const progressRows = rows.filter(
    (r): r is Extract<ImportCommitRow, { type: 'progress' }> =>
      r.type === 'progress'
  )
  const progressIds = [
    ...new Set(
      progressRows.flatMap((r) =>
        r.data.progressId ? [r.data.progressId] : []
      )
    ),
  ]
  const existingProgress = new Map<string, { id: string; levelId: string }>()
  if (progressIds.length) {
    const found = await prisma.progressUpdate.findMany({
      where: { id: { in: progressIds }, levelProgress: { userId } },
      select: { id: true, levelProgress: { select: { levelId: true } } },
    })
    for (const f of found) {
      existingProgress.set(f.id, { id: f.id, levelId: f.levelProgress.levelId })
    }
  }

  // ── Pre-fetch existing drop entries referenced by drop_id ─────────────
  // Same shape/purpose as the progress_id prefetch above — drops are
  // additive too, so round-trip identity is per-entry, not per-level.
  const droppedRows = rows.filter(
    (r): r is Extract<ImportCommitRow, { type: 'dropped' }> =>
      r.type === 'dropped'
  )
  const dropIds = [
    ...new Set(
      droppedRows.flatMap((r) => (r.data.dropId ? [r.data.dropId] : []))
    ),
  ]
  const existingDrops = new Map<string, { id: string; levelId: string }>()
  if (dropIds.length) {
    const found = await prisma.progressUpdate.findMany({
      where: { id: { in: dropIds }, kind: 'DROP', levelProgress: { userId } },
      select: { id: true, levelProgress: { select: { levelId: true } } },
    })
    for (const f of found) {
      existingDrops.set(f.id, { id: f.id, levelId: f.levelProgress.levelId })
    }
  }

  // ── Pre-fetch existing PROGRESS/DROP rows for the derived-key fallback ──
  // Feeds planProgress/planDrop's fallback for any row that ends up NOT
  // matching by explicit id — not just rows with no progressId/dropId at
  // all (name-only rows, which resolve their level too late for /check to
  // have caught a possible duplicate ahead of time), but also a row that
  // DOES carry an id that fails to resolve for this user/level (foreign,
  // stale, or copied from someone else's export). planProgress/planDrop's
  // `matched` lookup falls through to the derived key in both cases, so
  // scoping this prefetch to only the id-less rows starved that fallback of
  // the very data it needed for the second case — the fallback would find no
  // candidates at all (not "no match", but "nothing fetched to check
  // against") and silently create a duplicate. Fetching for every level
  // touched by a progress/dropped row in the batch, regardless of whether it
  // carries an id, costs nothing extra (batches are capped at 50 rows) and
  // closes that gap.
  const progressLevelIdsForDedup = [
    ...new Set(
      progressRows
        .map((r) => r.data.levelId ?? resolvedIds.get(r.rowIndex))
        .filter((id): id is string => !!id)
    ),
  ]
  const dropLevelIdsForDedup = [
    ...new Set(
      droppedRows
        .map((r) => r.data.levelId ?? resolvedIds.get(r.rowIndex))
        .filter((id): id is string => !!id)
    ),
  ]
  const [progressEventsForDedup, dropEventsForDedup] = await Promise.all([
    fetchExistingEvents(userId, 'PROGRESS', progressLevelIdsForDedup),
    fetchExistingEvents(userId, 'DROP', dropLevelIdsForDedup),
  ])
  const progressEventsByLevel = groupByLevel(progressEventsForDedup)
  const dropEventsByLevel = groupByLevel(dropEventsForDedup)

  // ── Plan all writes in memory (pure, no DB I/O) ───────────────────────
  const results: {
    rowIndex: number
    status: 'committed' | 'updated' | 'skipped' | 'failed'
    reason: string | null
    flagged: boolean
    levelName: string | null
    identifier: string | null
  }[] = []
  const writes = newBatchWrites()
  const lpPlans = new Map<string, LpPlan>()

  // The line a progress row may not be dated past: the date each level's
  // completion will carry once this batch is written. Starts from what is
  // stored, then lets this batch's own completion rows move it, since a
  // workbook that beats a level and backfills its sessions in one import must
  // measure against the date it is importing.
  //
  // A batch only ever sees part of the job, but that is enough: rows are
  // processed in rowIndex order and buildImportPayload offsets Dropped by
  // 100000 and Progress by 200000, so every completion in the job is written
  // before any progress row is planned — a level's completion is therefore
  // either in this batch or already in `storedCompletionDate`.
  const completionDateByLevel = new Map(storedCompletionDate)
  for (const row of rows) {
    if (row.type !== 'completion' || !row.data.date) continue
    const levelId = row.data.levelId ?? resolvedIds.get(row.rowIndex)
    if (!levelId) continue
    // Only rows planCompletion will actually apply move the line — mirroring
    // its own branches: 'drop'/'duplicate' are discarded, and an existing
    // completion with no resolution at all is skipped as an unmodified
    // re-import. Later rows win, matching the last-completion-per-level rule.
    if (row.resolution === 'drop' || row.resolution === 'duplicate') continue
    if (dbState.get(levelId)?.completionId && !row.resolution) continue
    completionDateByLevel.set(levelId, row.data.date)
  }

  const ctx: PlanCtx = {
    userId,
    writes,
    lpPlans,
    dbState,
    levelDiff,
    levelCoins,
    completionDateByLevel,
    existingProgress,
    existingDrops,
    progressEventsByLevel,
    dropEventsByLevel,
  }

  // Levels whose completion was written/updated this batch — they leave the
  // user's Want to Beat collection in the same transaction.
  const completedLevelIds = new Set<string>()

  // A level can appear more than once per tab (flagged as a duplicate upstream
  // for Completions). Keep only the last completion per level so we never plan
  // two completions for one LevelProgress; earlier occurrences are recorded
  // skipped. Progress and Dropped rows are exempt — multiple rows per level are
  // legitimate (session history / repeated drops) — except when two rows in
  // this batch target the same progress_id/drop_id (or, absent an id, the
  // same derived key — see deriveEventKey), where only the last one wins
  // (same "later row supersedes" rule either way).
  const lastCompletion = new Map<string, number>()
  const lastProgressById = new Map<string, number>()
  const lastDropById = new Map<string, number>()
  const lastProgressByKey = new Map<string, number>()
  const lastDropByKey = new Map<string, number>()
  for (const row of rows) {
    if (resolutionFailures.has(row.rowIndex)) continue
    if (row.type === 'progress') {
      if (row.data.progressId) {
        lastProgressById.set(row.data.progressId, row.rowIndex)
      } else {
        const id = row.data.levelId ?? resolvedIds.get(row.rowIndex)
        const key = deriveEventKey({
          date: row.data.date ?? null,
          percentage: row.data.percentage ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        })
        if (id && key != null)
          lastProgressByKey.set(`${id}::${key}`, row.rowIndex)
      }
      continue
    }
    if (row.type === 'dropped') {
      if (row.data.dropId) {
        lastDropById.set(row.data.dropId, row.rowIndex)
      } else {
        const id = row.data.levelId ?? resolvedIds.get(row.rowIndex)
        const key = deriveEventKey({
          date: row.data.droppedAt ?? null,
          percentage: row.data.bestProgress ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        })
        if (id && key != null) lastDropByKey.set(`${id}::${key}`, row.rowIndex)
      }
      continue
    }
    const id = row.data.levelId ?? resolvedIds.get(row.rowIndex)
    if (!id) continue
    lastCompletion.set(id, row.rowIndex)
  }

  for (const row of rows) {
    // Resolution failure for name-only rows.
    const failureReason = resolutionFailures.get(row.rowIndex)
    if (failureReason) {
      results.push({
        rowIndex: row.rowIndex,
        status: 'failed',
        reason: failureReason,
        flagged: false,
        levelName: row.data.levelName ?? null,
        identifier: row.data.levelId ?? null,
      })
      continue
    }

    const effectiveLevelId = row.data.levelId ?? resolvedIds.get(row.rowIndex)
    if (!effectiveLevelId) {
      const reason = 'No level_id or level_name provided'
      results.push({
        rowIndex: row.rowIndex,
        status: 'failed',
        reason,
        flagged: false,
        levelName: row.data.levelName ?? null,
        identifier: null,
      })
      continue
    }

    if (row.type === 'progress') {
      if (row.data.progressId) {
        const lastForId = lastProgressById.get(row.data.progressId)
        if (lastForId !== row.rowIndex) {
          results.push({
            rowIndex: row.rowIndex,
            status: 'skipped',
            reason:
              'Superseded by a later row targeting the same progress entry in this import',
            flagged: false,
            levelName: row.data.levelName ?? null,
            identifier: effectiveLevelId,
          })
          continue
        }
      } else {
        const key = deriveEventKey({
          date: row.data.date ?? null,
          percentage: row.data.percentage ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        })
        const lastForKey =
          key != null
            ? lastProgressByKey.get(`${effectiveLevelId}::${key}`)
            : undefined
        if (lastForKey != null && lastForKey !== row.rowIndex) {
          results.push({
            rowIndex: row.rowIndex,
            status: 'skipped',
            reason:
              'Superseded by a later row with the same date/percentage/run range in this import',
            flagged: false,
            levelName: row.data.levelName ?? null,
            identifier: effectiveLevelId,
          })
          continue
        }
      }
    } else if (row.type === 'dropped') {
      if (row.data.dropId) {
        const lastForId = lastDropById.get(row.data.dropId)
        if (lastForId !== row.rowIndex) {
          results.push({
            rowIndex: row.rowIndex,
            status: 'skipped',
            reason:
              'Superseded by a later row targeting the same drop entry in this import',
            flagged: false,
            levelName: row.data.levelName ?? null,
            identifier: effectiveLevelId,
          })
          continue
        }
      } else {
        const key = deriveEventKey({
          date: row.data.droppedAt ?? null,
          percentage: row.data.bestProgress ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        })
        const lastForKey =
          key != null
            ? lastDropByKey.get(`${effectiveLevelId}::${key}`)
            : undefined
        if (lastForKey != null && lastForKey !== row.rowIndex) {
          results.push({
            rowIndex: row.rowIndex,
            status: 'skipped',
            reason:
              'Superseded by a later row with the same date/percentage/run range in this import',
            flagged: false,
            levelName: row.data.levelName ?? null,
            identifier: effectiveLevelId,
          })
          continue
        }
      }
    } else {
      const lastForLevel = lastCompletion.get(effectiveLevelId)
      if (lastForLevel !== row.rowIndex) {
        const reason =
          'Superseded by a later row for the same level in this import'
        results.push({
          rowIndex: row.rowIndex,
          status: 'skipped',
          reason,
          flagged: false,
          levelName: row.data.levelName ?? null,
          identifier: effectiveLevelId,
        })
        continue
      }
    }

    let outcomeStatus: 'committed' | 'updated' | 'skipped' | 'failed'
    let reason: string | undefined
    let flagged = false
    try {
      if (row.type === 'completion') {
        const autoGddlTier = !row.data.userGddlTier
          ? (gddlTierCache.get(effectiveLevelId) ?? null)
          : null
        const result = planCompletion(
          ctx,
          effectiveLevelId,
          row.data,
          row.resolution,
          autoGddlTier,
          !row.data.levelId
        )
        outcomeStatus = result.status
        flagged = result.flagged ?? false
        if (outcomeStatus === 'committed' || outcomeStatus === 'updated') {
          completedLevelIds.add(effectiveLevelId)
        }
        reason = flagged
          ? 'Possible conflict — this level already has a completion with different data; re-import with a level_id column to resolve it during conflict review'
          : completionOutcomeReason(outcomeStatus, row.resolution)
      } else if (row.type === 'dropped') {
        const result = planDrop(ctx, effectiveLevelId, row.data, row.resolution)
        outcomeStatus = result.status
        reason = result.reason
        flagged = result.flagged ?? false
      } else {
        const result = planProgress(
          ctx,
          effectiveLevelId,
          row.data,
          row.resolution
        )
        outcomeStatus = result.status
        reason = result.reason
        flagged = result.flagged ?? false
      }
    } catch (err) {
      outcomeStatus = 'failed'
      reason = err instanceof Error ? err.message : 'Unknown error'
      logger.warn(
        { importJobId, rowIndex: row.rowIndex, levelId: effectiveLevelId, err },
        'importBatch: row failed'
      )
    }

    results.push({
      rowIndex: row.rowIndex,
      status: outcomeStatus!,
      reason: reason ?? null,
      flagged,
      levelName: row.data.levelName ?? null,
      identifier: effectiveLevelId,
    })
  }

  // ── Flush: stubs, batched writes, outcomes (one short transaction) ────
  let newStubIds: string[] = []

  await prisma.$transaction(
    async (tx) => {
      newStubIds = await ensureStubLevels(tx, allKnownIds)

      // Upgrade freshly-created stubs that have RobTop data — avoids a separate
      // seed-worker round-trip for name-resolved levels.
      for (const [levelId, rtData] of resolvedRobtopData) {
        if (newStubIds.includes(levelId)) {
          await tx.level.update({
            where: { inGameId: levelId },
            data: buildRobtopRefreshData(rtData),
          })
          // Already enriched — remove from the seed queue list.
          newStubIds = newStubIds.filter((id) => id !== levelId)
        }
      }

      // New LevelProgress rows first — ProgressUpdate creates below FK to them.
      if (writes.newLevelProgress.length) {
        await tx.levelProgress.createMany({ data: writes.newLevelProgress })
      }

      // Overwrite path: merge the provided fields into the existing completion.
      // Rating scores are InfernoLog-only data and are left untouched.
      for (const u of writes.progressUpdateUpdates) {
        await tx.progressUpdate.update({ where: { id: u.id }, data: u.data })
      }

      if (writes.newProgressUpdates.length) {
        await tx.progressUpdate.createMany({ data: writes.newProgressUpdates })
      }

      // Per-level LevelProgress updates (status / drop fields / worstFail) for
      // levels that already existed — new ones folded their changes into create.
      for (const plan of lpPlans.values()) {
        if (!plan.isNew && plan.touched) {
          await tx.levelProgress.update({
            where: { id: plan.id },
            data: plan.update,
          })
        }
      }

      // Auto-removal: a level with a fresh completion leaves Want to Beat.
      await removeFromWantToBeat(tx, userId, [...completedLevelIds])

      // Rows are updated in place (not created) — they were already inserted
      // as "pending" by POST /v1/me/import/start. issueMessage — and with it,
      // a spot in the "needs review" panel — is reserved for outcomes the
      // user hasn't already decided on and couldn't have predicted: an actual
      // failure, or a `flagged` committed row (a possible progress/dropped
      // duplicate /check couldn't catch ahead of time for name-only rows,
      // created anyway but worth a second look). A plain 'skipped' status
      // covers a lot of routine, expected outcomes too — an explicit
      // drop/duplicate resolution the user already chose during conflict
      // review, an exact-duplicate re-import, intra-batch supersession — none
      // of which need a second look, so 'skipped' alone no longer flags a row
      // (it used to; that mislabeled routine no-ops as "needs review").
      for (const r of results) {
        const id = rowDbId.get(r.rowIndex)
        if (!id) continue
        await tx.importJobRow.update({
          where: { id },
          data: {
            status: r.status,
            issueMessage: r.status === 'failed' || r.flagged ? r.reason : null,
            levelName: r.levelName,
            identifier: r.identifier,
          },
        })
      }

      await tx.importJob.update({
        where: { id: importJobId },
        data: { processedRows: { increment: results.length } },
      })
    },
    {
      // The transaction now issues only batched writes (a handful of createMany /
      // deleteMany calls plus a few per-row updates), so it comfortably fits the
      // window. Kept generous to absorb Neon latency spikes and overwrite-heavy
      // batches, while staying under API Gateway's hard 29s integration timeout.
      maxWait: 5000,
      timeout: 20000,
    }
  )

  // Enqueue remaining stub IDs (not pre-enriched) for async RobTop enrichment.
  if (newStubIds.length) {
    try {
      await enqueueSeedIds(newStubIds)
    } catch (err) {
      logger.warn(
        { newStubIds, err },
        'importBatch: failed to enqueue seed IDs'
      )
    }
  }

  return {
    outcomes: results.map((r) => ({
      rowIndex: r.rowIndex,
      status: r.status,
      reason: r.reason ?? undefined,
    })),
  }
}

/**
 * Synchronous single-shot commit helper: creates the job, inserts its rows as
 * "pending", and processes them in one call via processImportJobBatch. This is
 * what the background worker's per-batch loop reduces to for a small,
 * single-batch import — used directly by tests (and any other in-process
 * caller) that want the full plan/write logic without going through
 * POST /v1/me/import/start + an async Lambda invoke.
 */
export async function commitImportBatch(
  userId: string,
  importJobId: string,
  rows: ImportCommitRow[]
): Promise<ImportCommitResponse> {
  await prisma.importJob.deleteMany({ where: { userId } })
  await prisma.importJob.create({
    data: {
      id: importJobId,
      userId,
      status: 'running',
      totalRows: rows.length,
    },
  })

  const pending = rows.map((r) => ({
    id: randomUUID(),
    rowIndex: r.rowIndex,
    rawData: r,
  }))
  await prisma.importJobRow.createMany({
    data: pending.map((p) => ({
      id: p.id,
      jobId: importJobId,
      rowIndex: p.rowIndex,
      rawData: p.rawData as unknown as Prisma.InputJsonValue,
      status: 'pending',
      levelName: p.rawData.data.levelName ?? null,
      identifier: p.rawData.data.levelId ?? null,
    })),
  })

  return processImportJobBatch(userId, importJobId, pending)
}
