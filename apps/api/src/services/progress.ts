// Shared entry-creation service for the three FAB logging paths
// (completion / progress / drop).
//
// All three paths operate on the same underlying entity: a level_progress row
// for (userId, levelId). The find-or-create-then-apply logic lives here ONCE
// (findOrCreateLevelProgress) rather than being copied across the three
// handlers. See LOGGING_FLOW.md and the ticket spec.

import prisma from '../utils/prisma'
import type { Prisma, ProgressUpdateKind } from '@prisma/client'
import { removeFromWantToBeat } from './collections'
import type {
  CompletionInput,
  ProgressInput,
  DropInput,
  EditProgressInput,
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

// Thrown when an edit tries to write percentage/runFrom/runTo onto a
// ProgressUpdate that isn't kind=PROGRESS (completions are implied 100%,
// drops don't track a percentage) — a client-input error, so 400 not 500.
export class ProgressFieldsNotApplicableError extends Error {
  constructor(kind: string) {
    super(`percentage/runFrom/runTo only apply to PROGRESS entries, not ${kind}`)
    this.name = 'ProgressFieldsNotApplicableError'
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

const levelProgressInclude = {
  ratingScores: { select: { categoryId: true, score: true } },
} satisfies Prisma.LevelProgressInclude

// Loads the full resulting record so handlers can return it without a
// follow-up GET (the standard "return the whole record" response shape).
async function loadFullEntry(
  tx: Tx,
  levelProgressId: string,
  progressUpdateId: string
) {
  const [levelProgress, progressUpdate] = await Promise.all([
    tx.levelProgress.findUniqueOrThrow({
      where: { id: levelProgressId },
      include: levelProgressInclude,
    }),
    tx.progressUpdate.findUniqueOrThrow({
      where: { id: progressUpdateId },
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
      kind: 'COMPLETION' as const,
      date: input.date ?? null,
      dateTimezone: input.dateTimezone ?? null,
      dateUncertain: input.dateUncertain,
      attempts: input.attempts ?? null,
      fps: input.fps ?? null,
      percentageVersion: input.percentageVersion ?? null,
      onStream: input.onStream,
      videoUrl: input.videoUrl ?? null,
      highlightUrl: input.highlightUrl ?? null,
      notes: input.notes ?? null,
      enjoyment: input.enjoyment ?? null,
      difficultyOpinion: input.difficultyOpinion ?? null,
      inGameDifficulty: level?.inGameDifficulty ?? null,
      twoPlayerSolo: input.twoPlayerSolo ?? null,
      twoPlayerPartner: input.twoPlayerPartner ?? null,
      device: input.device ?? null,
    }

    // Edit-not-replace: if a completion already exists, UPDATE it in place.
    // The "one kind=COMPLETION per level_progress" invariant is preserved
    // because we never create a second completion row.
    const existing = await tx.progressUpdate.findFirst({
      where: { levelProgressId: lp.id, kind: 'COMPLETION' },
      select: { id: true },
    })

    let progressUpdateId: string
    if (existing) {
      await tx.progressUpdate.update({
        where: { id: existing.id },
        data: updateFields,
      })
      progressUpdateId = existing.id
      // Replace rating-score rows so the edit fully reflects the new
      // payload. Keyed on the LevelProgress — one current set of scores per
      // level. Only relevant when replacing an existing completion — a
      // brand-new one can't have any rating-score rows yet, so skip the
      // (guaranteed 0-row) delete.
      await tx.ratingScore.deleteMany({ where: { levelProgressId: lp.id } })
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
          levelProgressId: lp.id,
          categoryId: r.categoryId,
          score: r.score,
        })),
      })
    }
    // Mark the level_progress completed and apply the per-entry privacy.
    // worstFail/worstFailDate are only written when explicitly provided —
    // undefined means the user checked "I already logged my worst fail".
    await tx.levelProgress.update({
      where: { id: lp.id },
      data: {
        status: 'COMPLETED',
        visibility: input.visibility,
        userGddlTier: input.userGddlTier ?? null,
        simpleRating: input.simpleRating ?? null,
        coinsCollected: input.coinsCollected ?? null,
        completionTime: input.completionTime ?? null,
        ...(input.worstFail !== undefined
          ? { worstFail: input.worstFail }
          : {}),
        // worstFailDateTimezone is never written independently — whenever
        // worstFailDate changes, the timezone is always resolved alongside it
        // (defaulting to null, "no time entered") so a stale zone from a
        // prior edit can never linger paired with a new date.
        ...(input.worstFailDate !== undefined
          ? {
              worstFailDate: input.worstFailDate,
              worstFailDateTimezone: input.worstFailDateTimezone ?? null,
            }
          : {}),
      },
    })

    // A beaten level leaves Want to Beat — same transaction as the completion.
    await removeFromWantToBeat(tx, userId, input.levelId)

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
      kind: 'PROGRESS' as const,
      date: input.date ?? null,
      dateTimezone: input.dateTimezone ?? null,
      dateUncertain: input.dateUncertain,
      attempts: input.attempts ?? null,
      fps: input.fps ?? null,
      percentageVersion: input.percentageVersion ?? null,
      onStream: input.onStream,
      highlightUrl: input.highlightUrl ?? null,
      notes: input.notes ?? null,
      enjoyment: input.enjoyment ?? null,
      device: input.device ?? null,
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
// EDIT — partial update on a specific (or the most recent) ProgressUpdate and/or
// LevelProgress metadata. Only present keys are written. Returns null if no entry
// exists. When input.progressUpdateId is provided, that specific update is targeted;
// otherwise falls back to completion-first, then loggedAt desc.
// ─────────────────────────────────────────────

export async function applyEdit(
  userId: string,
  levelId: string,
  input: EditProgressInput
) {
  return prisma.$transaction(async (tx) => {
    const lp = await tx.levelProgress.findUnique({
      where: { userId_levelId: { userId, levelId } },
      select: { id: true },
    })
    if (!lp) return null

    let targetUpdateId: string | undefined
    let targetUpdateKind: ProgressUpdateKind | undefined
    if (input.progressUpdateId) {
      const update = await tx.progressUpdate.findFirst({
        where: { id: input.progressUpdateId, levelProgressId: lp.id },
        select: { id: true, kind: true },
      })
      if (!update) return null
      targetUpdateId = update.id
      targetUpdateKind = update.kind
    } else {
      const mostRecent = await tx.progressUpdate.findFirst({
        where: { levelProgressId: lp.id },
        orderBy: [{ kind: 'desc' }, { loggedAt: 'desc' }],
        select: { id: true, kind: true },
      })
      targetUpdateId = mostRecent?.id
      targetUpdateKind = mostRecent?.kind
    }
    // Every level_progress row is created together with at least one
    // progress_update (completion, progress, or drop) — see applyCompletion/
    // applyProgress/applyDrop below — so targetUpdateId is always found here.
    if (!targetUpdateId) return null

    // percentage/runFrom/runTo are only meaningful for kind=PROGRESS entries
    // (completions are implied 100%, drops don't track a percentage) — the
    // client (EditRunModal) already gates on this, but the endpoint is public
    // so it's enforced here too rather than trusting the caller.
    if (
      (input.percentage !== undefined ||
        input.runFrom !== undefined ||
        input.runTo !== undefined) &&
      targetUpdateKind !== 'PROGRESS'
    ) {
      throw new ProgressFieldsNotApplicableError(targetUpdateKind!)
    }

    const lpData: Prisma.LevelProgressUpdateInput = {}
    if (input.levelNotes !== undefined) lpData.levelNotes = input.levelNotes
    if (input.worstFail !== undefined) lpData.worstFail = input.worstFail
    // worstFailDateTimezone is never written independently — whenever
    // worstFailDate changes, the timezone is always resolved alongside it
    // (defaulting to null, "no time entered") so a stale zone from a prior
    // edit can never linger paired with a new date.
    if (input.worstFailDate !== undefined) {
      lpData.worstFailDate = input.worstFailDate
      lpData.worstFailDateTimezone = input.worstFailDateTimezone ?? null
    }
    if (input.visibility !== undefined) lpData.visibility = input.visibility
    if (input.userGddlTier !== undefined)
      lpData.userGddlTier = input.userGddlTier
    if (input.simpleRating !== undefined)
      lpData.simpleRating = input.simpleRating
    if (input.coinsCollected !== undefined)
      lpData.coinsCollected = input.coinsCollected
    if (input.completionTime !== undefined)
      lpData.completionTime = input.completionTime

    const puData: Prisma.ProgressUpdateUpdateInput = {}
    // dateTimezone is never written independently — see worstFailDate above.
    if (input.date !== undefined) {
      puData.date = input.date
      puData.dateTimezone = input.dateTimezone ?? null
    }
    if (input.dateUncertain !== undefined)
      puData.dateUncertain = input.dateUncertain
    if (input.attempts !== undefined) puData.attempts = input.attempts
    if (input.fps !== undefined) puData.fps = input.fps
    if (input.percentageVersion !== undefined)
      puData.percentageVersion = input.percentageVersion
    if (input.onStream !== undefined) puData.onStream = input.onStream
    if (input.difficultyOpinion !== undefined)
      puData.difficultyOpinion = input.difficultyOpinion
    if (input.enjoyment !== undefined) puData.enjoyment = input.enjoyment
    if (input.videoUrl !== undefined) puData.videoUrl = input.videoUrl
    if (input.highlightUrl !== undefined)
      puData.highlightUrl = input.highlightUrl
    if (input.notes !== undefined) puData.notes = input.notes
    if (input.twoPlayerSolo !== undefined)
      puData.twoPlayerSolo = input.twoPlayerSolo
    if (input.twoPlayerPartner !== undefined)
      puData.twoPlayerPartner = input.twoPlayerPartner
    if (input.device !== undefined) puData.device = input.device
    // Mutually exclusive, mirroring applyProgress's progressFields below —
    // a run either starts from 0% (percentage) or from a prior run
    // (runFrom/runTo), never both, so writing one clears the other. When only
    // one of runFrom/runTo is sent, the omitted side defaults rather than
    // clearing: no runFrom means the run started from 0, no runTo means it
    // reached 100.
    if (input.percentage !== undefined) {
      puData.percentage = input.percentage
      puData.runFrom = null
      puData.runTo = null
    } else if (input.runFrom !== undefined || input.runTo !== undefined) {
      puData.runFrom = input.runFrom ?? 0
      puData.runTo = input.runTo ?? 100
      puData.percentage = null
    }

    if (Object.keys(lpData).length > 0) {
      await tx.levelProgress.update({ where: { id: lp.id }, data: lpData })
    }

    if (Object.keys(puData).length > 0) {
      await tx.progressUpdate.update({
        where: { id: targetUpdateId },
        data: puData,
      })
    }
    if (input.ratingScores !== undefined) {
      await tx.ratingScore.deleteMany({ where: { levelProgressId: lp.id } })
      if (input.ratingScores.length > 0) {
        await tx.ratingScore.createMany({
          data: input.ratingScores.map((r) => ({
            levelProgressId: lp.id,
            categoryId: r.categoryId,
            score: r.score,
          })),
        })
      }
    }
    return loadFullEntry(tx, lp.id, targetUpdateId)
  })
}

// ─────────────────────────────────────────────
// DELETE PROGRESS UPDATE — removes a single logged entry (completion,
// progress log, or drop). RatingScore rows now live on LevelProgress (one
// current rating per level, independent of any specific event), so deleting
// a completion does NOT clear them — only coinsCollected/completionTime,
// which are meaningless once the level isn't marked completed.
//
// If it's the ONLY progress_update on the level_progress, the whole
// level_progress is deleted instead (a level_progress is always created
// together with at least one progress_update — see findOrCreateLevelProgress
// — so leaving one with zero updates would violate that invariant). Deleting
// the whole level_progress cascades RatingScore too, via the schema's
// onDelete: Cascade.
//
// Otherwise, status is recomputed by replaying the remaining updates in
// loggedAt order using the same rules the three write paths already apply on
// create (applyCompletion/applyProgress/applyDrop): a COMPLETION or DROP sets
// status outright, a PROGRESS only flips DROPPED back to IN_PROGRESS. If that
// walks status away from COMPLETED (i.e. the completion itself was deleted),
// the now-invalid classic_ranking entry is removed too — only COMPLETED
// entries may have one.
// ─────────────────────────────────────────────

export async function deleteProgressUpdate(
  userId: string,
  levelId: string,
  progressUpdateId: string
): Promise<{ deletedLevelProgress: boolean } | null> {
  return prisma.$transaction(async (tx) => {
    const lp = await tx.levelProgress.findUnique({
      where: { userId_levelId: { userId, levelId } },
      select: { id: true, status: true },
    })
    if (!lp) return null

    const target = await tx.progressUpdate.findFirst({
      where: { id: progressUpdateId, levelProgressId: lp.id },
      select: { id: true },
    })
    if (!target) return null

    const remaining = await tx.progressUpdate.findMany({
      where: { levelProgressId: lp.id, id: { not: target.id } },
      orderBy: { loggedAt: 'asc' },
      select: { kind: true },
    })

    if (remaining.length === 0) {
      await tx.levelProgress.delete({ where: { id: lp.id } })
      return { deletedLevelProgress: true }
    }

    await tx.progressUpdate.delete({ where: { id: target.id } })

    let newStatus: 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED' = 'IN_PROGRESS'
    for (const update of remaining) {
      if (update.kind === 'COMPLETION') newStatus = 'COMPLETED'
      else if (update.kind === 'DROP') newStatus = 'DROPPED'
      else if (newStatus === 'DROPPED') newStatus = 'IN_PROGRESS'
    }

    const uncompleting = lp.status === 'COMPLETED' && newStatus !== 'COMPLETED'
    if (newStatus !== lp.status) {
      await tx.levelProgress.update({
        where: { id: lp.id },
        data: {
          status: newStatus,
          // Only meaningful once completed — cleared when the completion is
          // undone. Folded into the same write as the status change (both
          // always fire together, since `uncompleting` implies `newStatus
          // !== lp.status`) rather than a second round-trip to the same row.
          ...(uncompleting
            ? { coinsCollected: null, completionTime: null }
            : {}),
        },
      })
    }
    if (uncompleting) {
      await tx.classicRanking.deleteMany({ where: { levelProgressId: lp.id } })
    }

    return { deletedLevelProgress: false }
  })
}

// ─────────────────────────────────────────────
// DROP — a status transition backed by its own progress_update (kind=DROP),
// same as completion/progress. A level can be dropped more than once (drop →
// resume → drop again); each drop is its own row, never overwritten.
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

    const created = await tx.progressUpdate.create({
      data: {
        levelProgressId: lp.id,
        kind: 'DROP',
        date: input.date ?? null,
        dateTimezone: input.dateTimezone ?? null,
        attempts: input.attempts ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true },
    })

    await tx.levelProgress.update({
      where: { id: lp.id },
      data: {
        status: 'DROPPED',
        visibility: input.visibility,
        ...(input.worstFail !== undefined
          ? { worstFail: input.worstFail }
          : {}),
        // worstFailDateTimezone is never written independently — see
        // applyCompletion/applyEdit above.
        ...(input.worstFailDate !== undefined
          ? {
              worstFailDate: input.worstFailDate,
              worstFailDateTimezone: input.worstFailDateTimezone ?? null,
            }
          : {}),
      },
    })

    return loadFullEntry(tx, lp.id, created.id)
  })
}
