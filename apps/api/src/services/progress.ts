// Shared entry-creation service for the three FAB logging paths
// (completion / progress / drop).
//
// All three paths operate on the same underlying entity: a level_progress row
// for (userId, levelId). The find-or-create-then-apply logic lives here ONCE
// (findOrCreateLevelProgress) rather than being copied across the three
// handlers. See LOGGING_FLOW.md and the ticket spec.

import prisma from '../utils/prisma'
import type { Prisma } from '@prisma/client'
import type {
  CompletionInput,
  ProgressInput,
  DropInput,
} from '@infernolog/core'

type Tx = Prisma.TransactionClient

// Thrown when a write targets a level that isn't in the `levels` cache yet.
// The flow resolves/creates the level (autofill or manual entry) before any
// write, so this is a client-sequencing error → surfaced as a 400, not a 500.
export class LevelNotFoundError extends Error {
  constructor(levelId: string) {
    super(`Level ${levelId} is not cached. Resolve it before logging.`)
    this.name = 'LevelNotFoundError'
  }
}

async function ensureLevelExists(tx: Tx, levelId: string): Promise<void> {
  const level = await tx.level.findUnique({
    where: { inGameId: levelId },
    select: { inGameId: true },
  })
  if (!level) throw new LevelNotFoundError(levelId)
}

// THE shared piece: resolve or create the level_progress for (userId, levelId).
// `initialStatus` is only used when the row does not exist yet — notably it
// allows direct creation straight into DROPPED (drop-from-scratch), which the
// state diagram doesn't draw but the real flow requires.
export async function findOrCreateLevelProgress(
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

// ─────────────────────────────────────────────
// Serialization — Prisma returns Decimal instances; the wire shape uses plain
// numbers. Dates are left as Date (Hono's c.json serializes them to ISO).
// ─────────────────────────────────────────────

type DecimalLike = { toNumber(): number }
const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()

const progressUpdateInclude = {
  ratingScores: { select: { categoryId: true, score: true } },
  listReferences: {
    select: { listSource: true, tierOrRank: true, atTimeOfLogging: true },
  },
} satisfies Prisma.ProgressUpdateInclude

// Loads the full resulting record so handlers can return it without a
// follow-up GET (the standard "return the whole record" response shape).
async function loadFullEntry(
  tx: Tx,
  levelProgressId: string,
  progressUpdateId: string
) {
  const [levelProgress, progressUpdate] = await Promise.all([
    tx.levelProgress.findUniqueOrThrow({ where: { id: levelProgressId } }),
    tx.progressUpdate.findUniqueOrThrow({
      where: { id: progressUpdateId },
      include: progressUpdateInclude,
    }),
  ])
  return {
    levelProgress,
    // percentage is the only Decimal on a progress update — convert to number.
    progressUpdate: {
      ...progressUpdate,
      percentage: toNum(progressUpdate.percentage),
    },
  }
}

// ─────────────────────────────────────────────
// COMPLETION — edit-not-replace, idempotent on the single completion update.
// ─────────────────────────────────────────────

export async function applyCompletion(userId: string, input: CompletionInput) {
  return prisma.$transaction(async (tx) => {
    await ensureLevelExists(tx, input.levelId)
    const lp = await findOrCreateLevelProgress(
      tx,
      userId,
      input.levelId,
      'COMPLETED'
    )

    // In-game difficulty is snapshotted from the cached level — NEVER from the
    // client (it is read-only difficulty data).
    const level = await tx.level.findUnique({
      where: { inGameId: input.levelId },
      select: { inGameDifficulty: true },
    })

    const updateFields = {
      isCompletion: true,
      date: input.date ?? null,
      dateUncertain: input.dateUncertain,
      attempts: input.attempts ?? null,
      fps: input.fps ?? null,
      onStream: input.onStream,
      videoUrl: input.videoUrl ?? null,
      highlightUrl: input.highlightUrl ?? null,
      notes: input.notes ?? null,
      enjoyment: input.enjoyment ?? null,
      simpleRating: input.simpleRating ?? null,
      difficultyOpinion: input.difficultyOpinion ?? null,
      inGameDifficulty: level?.inGameDifficulty ?? null,
    }

    // Edit-not-replace: if a completion already exists, UPDATE it in place.
    // The "one isCompletion=true per level_progress" invariant is preserved
    // because we never create a second completion row.
    const existing = await tx.progressUpdate.findFirst({
      where: { levelProgressId: lp.id, isCompletion: true },
      select: { id: true },
    })

    let progressUpdateId: string
    if (existing) {
      await tx.progressUpdate.update({
        where: { id: existing.id },
        data: updateFields,
      })
      // Replace child rows so the edit fully reflects the new payload.
      await tx.ratingScore.deleteMany({
        where: { progressUpdateId: existing.id },
      })
      await tx.listReference.deleteMany({
        where: { progressUpdateId: existing.id },
      })
      progressUpdateId = existing.id
    } else {
      const created = await tx.progressUpdate.create({
        data: { ...updateFields, levelProgressId: lp.id },
        select: { id: true },
      })
      progressUpdateId = created.id
    }

    if (input.ratingScores?.length) {
      await tx.ratingScore.createMany({
        data: input.ratingScores.map((r) => ({
          progressUpdateId,
          categoryId: r.categoryId,
          score: r.score,
        })),
      })
    }
    if (input.listReferences?.length) {
      await tx.listReference.createMany({
        data: input.listReferences.map((l) => ({
          progressUpdateId,
          listSource: l.listSource,
          tierOrRank: l.tierOrRank,
          atTimeOfLogging: l.atTimeOfLogging,
        })),
      })
    }

    // Self-reported GDDL record-accepted toggle. Independent of the async
    // submitToGddl side effect — when the client sends it, upsert the GDDL
    // RecordAcceptance synchronously. Omitted → leave any existing row alone.
    if (input.gddlRecordAccepted !== undefined) {
      await tx.recordAcceptance.upsert({
        where: {
          progressUpdateId_listSource: { progressUpdateId, listSource: 'GDDL' },
        },
        create: {
          progressUpdateId,
          listSource: 'GDDL',
          isAccepted: input.gddlRecordAccepted,
          acceptedAt: input.gddlRecordAccepted ? new Date() : null,
        },
        update: {
          isAccepted: input.gddlRecordAccepted,
          acceptedAt: input.gddlRecordAccepted ? new Date() : null,
        },
      })
    }

    // Mark the level_progress completed and apply the per-entry privacy.
    await tx.levelProgress.update({
      where: { id: lp.id },
      data: {
        status: 'COMPLETED',
        visibility: input.visibility,
        worstFail: input.worstFail ?? null,
      },
    })

    return loadFullEntry(tx, lp.id, progressUpdateId)
  })
}

// ─────────────────────────────────────────────
// PROGRESS — non-completion update.
// ─────────────────────────────────────────────

export async function applyProgress(userId: string, input: ProgressInput) {
  return prisma.$transaction(async (tx) => {
    await ensureLevelExists(tx, input.levelId)
    const lp = await findOrCreateLevelProgress(
      tx,
      userId,
      input.levelId,
      'IN_PROGRESS'
    )

    // STATUS DECISION: logging progress on a DROPPED level flips it back to
    // IN_PROGRESS — logging progress implies active play. COMPLETED is left
    // untouched (extra progress on a beaten level doesn't un-complete it).
    // See LOGGING_FLOW_RECONCILIATION.md.
    const status = lp.status === 'DROPPED' ? 'IN_PROGRESS' : lp.status

    const base = {
      isCompletion: false,
      date: input.date ?? null,
      dateUncertain: input.dateUncertain,
      attempts: input.attempts ?? null,
      fps: input.fps ?? null,
      onStream: input.onStream,
      highlightUrl: input.highlightUrl ?? null,
      notes: input.notes ?? null,
      enjoyment: input.enjoyment ?? null,
    }
    const progressFields =
      input.mode === 'from_zero'
        ? { percentage: input.percentage }
        : { runFrom: input.runFrom, runTo: input.runTo }

    const created = await tx.progressUpdate.create({
      data: { ...base, ...progressFields, levelProgressId: lp.id },
      select: { id: true },
    })

    await tx.levelProgress.update({
      where: { id: lp.id },
      data: { status, visibility: input.visibility },
    })

    return loadFullEntry(tx, lp.id, created.id)
  })
}

// ─────────────────────────────────────────────
// DROP — status transition with optional metadata. No progress_update.
// Drop-from-scratch supported via findOrCreateLevelProgress(initial=DROPPED).
// ─────────────────────────────────────────────

export async function applyDrop(userId: string, input: DropInput) {
  return prisma.$transaction(async (tx) => {
    await ensureLevelExists(tx, input.levelId)
    const lp = await findOrCreateLevelProgress(
      tx,
      userId,
      input.levelId,
      'DROPPED'
    )
    const updated = await tx.levelProgress.update({
      where: { id: lp.id },
      data: {
        status: 'DROPPED',
        droppedAt: input.droppedAt ?? null,
        droppedReason: input.droppedReason ?? null,
        attemptsAtDrop: input.attemptsAtDrop ?? null,
        worstFail: input.worstFail ?? null,
        visibility: input.visibility,
      },
    })
    return { levelProgress: updated, progressUpdate: null }
  })
}
