// Spreadsheet import service — commit logic for POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop
// writes, cross-tab reconciliation (completion + drop for same level),
// conflict resolution, idempotency via (importJobId, rowIndex) keys,
// name-based level resolution, and GDDL tier autofill.

import prisma from '../utils/prisma'
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs'
import type { Prisma } from '@prisma/client'
import { DifficultyOpinion, ListSource } from '@infernolog/core'
import type {
  ImportCompletionRow,
  ImportDroppedRow,
  ImportCommitRow,
  ImportCommitResponse,
} from '@infernolog/core'
import { logger } from '../utils/logger'
import { searchRobtopByName, type RobtopLevel } from '../utils/robtop'
import { fetchGddlTier } from '../utils/gddl'

type Tx = Prisma.TransactionClient

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

// ── Name-based level resolution ────────────────────────────────────────────

// Resolves a level ID from its name, checking InfernoLog's cache first then
// falling back to a live RobTop name search. Returns:
//   { levelId, robtopLevel? } — unique match (robtopLevel present when found via RobTop)
//   'ambiguous'               — multiple candidates even after creator hint filtering
//   null                      — no match found anywhere
async function resolveByName(
  name: string,
  creator?: string | null
): Promise<{ levelId: string; robtopLevel?: RobtopLevel } | 'ambiguous' | null> {
  // 1. Check local cache first.
  const dbLevels = await prisma.level.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { inGameId: true, creator: true },
  })

  let dbCandidates = dbLevels
  if (creator && dbCandidates.length > 1) {
    const hint = creator.toLowerCase()
    const filtered = dbCandidates.filter(
      (l) => l.creator?.toLowerCase().includes(hint)
    )
    if (filtered.length > 0) dbCandidates = filtered
  }

  if (dbCandidates.length === 1) return { levelId: dbCandidates[0]!.inGameId }
  if (dbCandidates.length > 1) return 'ambiguous'

  // 2. Search RobTop by name. Filter to exact-name matches (the search is
  //    keyword-based and may return partial matches).
  const rtResults = await searchRobtopByName(name)
  const exact = rtResults.filter(
    (r) => r.level.name?.toLowerCase() === name.toLowerCase()
  )

  let rtCandidates = exact
  if (creator && rtCandidates.length > 1) {
    const hint = creator.toLowerCase()
    const filtered = rtCandidates.filter(
      (r) => r.level.creator?.toLowerCase().includes(hint)
    )
    if (filtered.length > 0) rtCandidates = filtered
  }

  if (rtCandidates.length === 1) {
    const match = rtCandidates[0]!
    return { levelId: match.levelId, robtopLevel: match.level }
  }
  if (rtCandidates.length > 1) return 'ambiguous'
  return null
}

// ── Stub level creation ────────────────────────────────────────────────────

async function ensureStubLevels(
  tx: Tx,
  levelIds: string[]
): Promise<string[]> {
  if (!levelIds.length) return []

  const existing = await tx.level.findMany({
    where: { inGameId: { in: levelIds } },
    select: { inGameId: true },
  })
  const existingSet = new Set(existing.map((l) => l.inGameId))
  const toCreate = levelIds.filter((id) => !existingSet.has(id))

  if (toCreate.length) {
    await tx.level.createMany({
      data: toCreate.map((id) => ({
        inGameId: id,
        dataSource: 'manual',
        verified: false,
      })),
      skipDuplicates: true,
    })
  }

  return toCreate
}

// ── SQS enqueue ───────────────────────────────────────────────────────────

async function enqueueSeedIds(levelIds: string[]): Promise<void> {
  const queueUrl = process.env.LEVEL_SEED_QUEUE_URL
  if (!queueUrl || !levelIds.length) return

  const BATCH_SIZE = 8
  const messageBatches: string[][] = []
  for (let i = 0; i < levelIds.length; i += BATCH_SIZE) {
    messageBatches.push(levelIds.slice(i, i + BATCH_SIZE))
  }

  const SQS_BATCH = 10
  for (let i = 0; i < messageBatches.length; i += SQS_BATCH) {
    const chunk = messageBatches.slice(i, i + SQS_BATCH)
    await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: chunk.map((ids, idx) => ({
          Id: String(i + idx),
          MessageBody: JSON.stringify({ levelIds: ids }),
        })),
      })
    )
  }
}

// ── Completion commit ──────────────────────────────────────────────────────

async function commitCompletion(
  tx: Tx,
  userId: string,
  levelId: string,
  row: ImportCompletionRow,
  resolution: 'skip' | 'overwrite' | undefined,
  autoGddlTier: number | null
): Promise<'committed' | 'skipped'> {
  const lp = await tx.levelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } },
    include: {
      progressUpdates: {
        where: { isCompletion: true },
        select: { id: true },
        take: 1,
      },
    },
  })

  const existingCompletion = lp?.progressUpdates[0] ?? null

  if (existingCompletion) {
    if (resolution === 'skip') return 'skipped'
    if (resolution !== 'overwrite') return 'skipped'
  }

  const level = await tx.level.findUnique({
    where: { inGameId: levelId },
    select: { inGameDifficulty: true },
  })

  const updateFields = {
    isCompletion: true as const,
    date: row.date ? new Date(row.date) : null,
    dateUncertain: row.dateUncertain ?? false,
    attempts: row.attempts ?? null,
    fps: row.fps ?? null,
    onStream: row.onStream ?? false,
    videoUrl: row.videoUrl ?? null,
    highlightUrl: row.highlightUrl ?? null,
    notes: row.notes ?? null,
    enjoyment: row.enjoyment != null ? Math.round(row.enjoyment * 10) : null,
    simpleRating:
      row.simpleRating != null ? Math.round(row.simpleRating * 10) : null,
    difficultyOpinion: row.difficultyOpinion ?? null,
    inGameDifficulty: level?.inGameDifficulty ?? null,
  }

  let progressUpdateId: string

  if (existingCompletion && resolution === 'overwrite') {
    await tx.progressUpdate.update({
      where: { id: existingCompletion.id },
      data: updateFields,
    })
    await tx.listReference.deleteMany({
      where: { progressUpdateId: existingCompletion.id },
    })
    await tx.ratingScore.deleteMany({
      where: { progressUpdateId: existingCompletion.id },
    })
    progressUpdateId = existingCompletion.id
  } else {
    const newLp = await upsertLevelProgress(tx, userId, levelId, 'COMPLETED')
    const created = await tx.progressUpdate.create({
      data: { ...updateFields, levelProgressId: newLp.id },
      select: { id: true },
    })
    progressUpdateId = created.id
  }

  // Build list references. GDDL tier: explicit row value takes precedence;
  // fall back to the autofilled value when the user left it blank.
  const refs: { listSource: ListSource; tierOrRank: string }[] = []
  if (row.gddlTier != null) {
    refs.push({ listSource: ListSource.GDDL, tierOrRank: String(row.gddlTier) })
  } else if (autoGddlTier != null) {
    refs.push({ listSource: ListSource.GDDL, tierOrRank: String(autoGddlTier) })
  }
  if (row.nlwTier != null)
    refs.push({ listSource: ListSource.NLW, tierOrRank: row.nlwTier })
  if (refs.length) {
    await tx.listReference.createMany({
      data: refs.map((r) => ({
        progressUpdateId,
        listSource: r.listSource,
        tierOrRank: r.tierOrRank,
        atTimeOfLogging: true,
      })),
    })
  }

  const lpId = (
    await tx.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId, levelId } },
      select: { id: true },
    })
  ).id

  await tx.levelProgress.update({
    where: { id: lpId },
    data: {
      status: 'COMPLETED',
      ...(row.percentage != null ? { worstFail: Math.round(row.percentage) } : {}),
    },
  })

  return 'committed'
}

// ── Drop commit ────────────────────────────────────────────────────────────

async function commitDrop(
  tx: Tx,
  userId: string,
  levelId: string,
  row: ImportDroppedRow
): Promise<'committed'> {
  const lp = await upsertLevelProgress(tx, userId, levelId, 'DROPPED')

  const newStatus = lp.status === 'COMPLETED' ? 'COMPLETED' : ('DROPPED' as const)

  await tx.levelProgress.update({
    where: { id: lp.id },
    data: {
      status: newStatus,
      droppedAt: row.droppedAt ? new Date(row.droppedAt) : null,
      droppedReason: row.reason ?? null,
      attemptsAtDrop: row.attemptsAtDrop ?? null,
      ...(row.bestProgress != null ? { worstFail: Math.round(row.bestProgress) } : {}),
    },
  })

  return 'committed'
}

// ── Shared level_progress find-or-create ──────────────────────────────────

async function upsertLevelProgress(
  tx: Tx,
  userId: string,
  levelId: string,
  initialStatus: 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
) {
  const existing = await tx.levelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } },
  })
  if (existing) return existing
  return tx.levelProgress.create({
    data: { userId, levelId, status: initialStatus },
  })
}

// ── Main commit function ───────────────────────────────────────────────────

export async function commitImportBatch(
  userId: string,
  importJobId: string,
  rows: ImportCommitRow[]
): Promise<ImportCommitResponse> {
  await prisma.importJob.upsert({
    where: { id: importJobId },
    create: { id: importJobId, userId },
    update: {},
  })

  const existingRows = await prisma.importJobRow.findMany({
    where: {
      jobId: importJobId,
      rowIndex: { in: rows.map((r) => r.rowIndex) },
    },
  })
  const processed = new Map(
    existingRows.map((r) => [r.rowIndex, { status: r.status, reason: r.reason }])
  )

  // Check whether this user has a GDDL key registered (gates autofill).
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { gddlApiKeyEncrypted: true },
  })
  const hasGddlKey = !!user.gddlApiKeyEncrypted

  // ── Pre-resolve name-only rows (outside the transaction) ──────────────
  // Resolving via RobTop involves network I/O that must not hold a DB
  // transaction open.
  const resolvedIds = new Map<number, string>()       // rowIndex → levelId
  const resolvedRobtopData = new Map<string, RobtopLevel>() // levelId → full data
  const resolutionFailures = new Map<number, string>() // rowIndex → reason

  const nameOnlyRows = rows.filter(
    (r) => !processed.has(r.rowIndex) && !r.data.levelId && r.data.levelName
  )
  for (const row of nameOnlyRows) {
    const result = await resolveByName(row.data.levelName!, row.data.creator)
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
      if (result.robtopLevel) resolvedRobtopData.set(result.levelId, result.robtopLevel)
    }
  }

  // ── Pre-fetch GDDL tiers in parallel (outside the transaction) ────────
  const gddlTierCache = new Map<string, number | null>()
  if (hasGddlKey) {
    const completionRows = rows.filter(
      (r) => r.type === 'completion' && !processed.has(r.rowIndex) && !r.data.gddlTier
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
  }

  // ── Transaction: write levels, progress, and record outcomes ──────────
  const outcomes: ImportCommitResponse['outcomes'] = []
  const newOutcomes: { rowIndex: number; status: string; reason: string | null }[] = []

  const allKnownIds = [
    ...new Set([
      ...rows.filter((r) => r.data.levelId).map((r) => r.data.levelId!),
      ...resolvedIds.values(),
    ]),
  ]

  let newStubIds: string[] = []

  await prisma.$transaction(async (tx) => {
    newStubIds = await ensureStubLevels(tx, allKnownIds)

    // Upgrade freshly-created stubs that have RobTop data — avoids a separate
    // seed-worker round-trip for name-resolved levels.
    for (const [levelId, rtData] of resolvedRobtopData) {
      if (newStubIds.includes(levelId)) {
        await tx.level.update({
          where: { inGameId: levelId },
          data: {
            name: rtData.name,
            creator: rtData.creator,
            inGameDifficulty: rtData.inGameDifficulty,
            length: rtData.length,
            songName: rtData.songName,
            songAuthor: rtData.songAuthor,
            isRated: rtData.isRated,
            isDemon: rtData.isDemon,
            levelType: rtData.platformer ? 'PLATFORMER' : 'CLASSIC',
            description: rtData.description,
            creatorPlayerId: rtData.creatorPlayerId,
            creatorAccountId: rtData.creatorAccountId,
            stars: rtData.stars,
            starsRequested: rtData.starsRequested,
            partialDiff: rtData.partialDiff,
            difficultyFace: rtData.difficultyFace,
            downloads: rtData.downloads,
            likes: rtData.likes,
            disliked: rtData.disliked,
            objectCount: rtData.objectCount,
            largeLevel: rtData.largeLevel,
            coins: rtData.coins,
            coinsVerified: rtData.coinsVerified,
            featured: rtData.featured,
            featureScore: rtData.featureScore,
            epicValue: rtData.epicValue,
            twoPlayer: rtData.twoPlayer,
            lowDetailMode: rtData.lowDetailMode,
            copiedFromId: rtData.copiedFromId,
            levelVersion: rtData.levelVersion,
            gameVersion: rtData.gameVersion,
            editorSeconds: rtData.editorSeconds,
            editorSecondsTotal: rtData.editorSecondsTotal,
            officialSongId: rtData.officialSongId,
            songId: rtData.songId,
            songLink: rtData.songLink,
            songSize: rtData.songSize,
            dataSource: 'robtop_autofill',
            verified: true,
            lastCheckedAt: new Date(),
          },
        })
        // Already enriched — remove from the seed queue list.
        newStubIds = newStubIds.filter((id) => id !== levelId)
      }
    }

    for (const row of rows) {
      const prior = processed.get(row.rowIndex)
      if (prior) {
        outcomes.push({
          rowIndex: row.rowIndex,
          status: prior.status as 'committed' | 'skipped' | 'failed',
          reason: prior.reason ?? undefined,
        })
        continue
      }

      // Resolution failure for name-only rows.
      const failureReason = resolutionFailures.get(row.rowIndex)
      if (failureReason) {
        outcomes.push({ rowIndex: row.rowIndex, status: 'failed', reason: failureReason })
        newOutcomes.push({ rowIndex: row.rowIndex, status: 'failed', reason: failureReason })
        continue
      }

      const effectiveLevelId = row.data.levelId ?? resolvedIds.get(row.rowIndex)
      if (!effectiveLevelId) {
        const reason = 'No level_id or level_name provided'
        outcomes.push({ rowIndex: row.rowIndex, status: 'failed', reason })
        newOutcomes.push({ rowIndex: row.rowIndex, status: 'failed', reason })
        continue
      }

      let outcomeStatus: 'committed' | 'skipped' | 'failed'
      let reason: string | undefined

      try {
        if (row.type === 'completion') {
          const autoGddlTier =
            hasGddlKey && !row.data.gddlTier
              ? (gddlTierCache.get(effectiveLevelId) ?? null)
              : null
          outcomeStatus = await commitCompletion(
            tx,
            userId,
            effectiveLevelId,
            row.data,
            row.conflictResolution,
            autoGddlTier
          )
        } else {
          await commitDrop(tx, userId, effectiveLevelId, row.data)
          outcomeStatus = 'committed'
        }
      } catch (err) {
        outcomeStatus = 'failed'
        reason = err instanceof Error ? err.message : 'Unknown error'
        logger.warn(
          { importJobId, rowIndex: row.rowIndex, levelId: effectiveLevelId, err },
          'importBatch: row failed'
        )
      }

      outcomes.push({ rowIndex: row.rowIndex, status: outcomeStatus!, reason })
      newOutcomes.push({ rowIndex: row.rowIndex, status: outcomeStatus!, reason: reason ?? null })
    }

    if (newOutcomes.length) {
      await tx.importJobRow.createMany({
        data: newOutcomes.map((o) => ({
          jobId: importJobId,
          rowIndex: o.rowIndex,
          status: o.status,
          reason: o.reason ?? null,
        })),
        skipDuplicates: true,
      })
    }
  })

  // Enqueue remaining stub IDs (not pre-enriched) for async RobTop enrichment.
  if (newStubIds.length) {
    try {
      await enqueueSeedIds(newStubIds)
    } catch (err) {
      logger.warn({ newStubIds, err }, 'importBatch: failed to enqueue seed IDs')
    }
  }

  return { outcomes }
}

// ── Check function ─────────────────────────────────────────────────────────

export async function checkImportConflicts(
  userId: string,
  levelIds: string[]
): Promise<{ conflicts: Array<{
  levelId: string
  levelName: string | null
  date: string | null
  attempts: number | null
  enjoyment: number | null
  simpleRating: number | null
  difficultyOpinion: DifficultyOpinion | null
}> }> {
  const rows = await prisma.levelProgress.findMany({
    where: {
      userId,
      levelId: { in: levelIds },
      progressUpdates: { some: { isCompletion: true } },
    },
    include: {
      level: { select: { name: true } },
      progressUpdates: {
        where: { isCompletion: true },
        select: {
          date: true,
          attempts: true,
          enjoyment: true,
          simpleRating: true,
          difficultyOpinion: true,
        },
        orderBy: { loggedAt: 'desc' },
        take: 1,
      },
    },
  })

  const conflicts = rows.map((lp) => {
    const pu = lp.progressUpdates[0]
    return {
      levelId: lp.levelId,
      levelName: lp.level.name,
      date: pu?.date ? (pu.date as Date).toISOString().slice(0, 10) : null,
      attempts: pu?.attempts ?? null,
      enjoyment: pu?.enjoyment != null ? pu.enjoyment / 10 : null,
      simpleRating: pu?.simpleRating != null ? pu.simpleRating / 10 : null,
      difficultyOpinion:
        (pu?.difficultyOpinion as DifficultyOpinion | null) ?? null,
    }
  })

  return { conflicts }
}
