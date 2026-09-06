// Write planning, part 1 — the in-memory plan structures and completion rows.
//
// Neon's serverless driver makes every `tx.*` call a network round-trip, so a
// 50-row batch of per-row reads+writes inside one interactive transaction blew
// past Prisma's transaction timeout. Every write is PLANNED in memory first
// (UUIDs generated application-side so no round-trip is needed to learn an id)
// and flushed later as batched createMany/deleteMany calls. See planEvents.ts
// for the progress/drop half and processBatch.ts for the flush.

// Spreadsheet import service — commit logic for POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop
// writes, cross-tab reconciliation (completion + drop for same level),
// conflict resolution, idempotency via (importJobId, rowIndex) keys,
// name-based level resolution, and GDDL tier autofill.

import { randomUUID } from 'node:crypto'
import type { DifficultyOpinion, Prisma } from '@prisma/client'
import type {
  ImportCompletionRow,
  ImportConflictAction,
} from '@infernolog/core'
import { roundGddlTier } from '../../../utils/gddl'
import type { ExistingEventSnapshot } from './planEvents'

// ── Write planning (in-memory) ─────────────────────────────────────────────
//
// Neon's serverless driver makes every `tx.*` call a network round-trip, so a
// 50-row batch of per-row reads+writes inside one interactive transaction blew
// past Prisma's transaction timeout (the "Transaction not found" error). We now
// PLAN every write in memory first — generating UUIDs application-side so we
// never need a round-trip to learn a generated id — then flush the plan as a
// handful of batched createMany/deleteMany calls plus the few genuinely per-row
// updates (status changes and overwrites).

/** The three level_progress states, mirrored from the Prisma enum. */
export type LpStatus = 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'

interface LpFields {
  status?: LpStatus
  // Nullable (not just optional) so a full overwrite can explicitly clear a
  // field the sheet leaves blank, rather than only ever being able to omit it.
  worstFail?: number | null
  worstFailDate?: Date | null
  // Import rows never carry a real time-of-day for worstFailDate — always
  // nulled alongside worstFailDate so a previously-real-time value (from an
  // ordinary logging-flow entry) doesn't linger stale on the new date.
  worstFailDateTimezone?: string | null
  visibility?: 'PUBLIC' | 'PRIVATE'
  levelNotes?: string | null
  userGddlTier?: number | null
  difficultyOpinion?: DifficultyOpinion | null
  // One current value per level, not per event — see schema.prisma.
  simpleRating?: number | null
  coinsCollected?: number | null
}

/**
 * The pending write for one level_progress, accumulated across every row in the
 * batch that touches that level before anything is flushed.
 *
 * A brand-new row mutates `create` in place; an existing one accumulates into
 * `update`. That is what lets several sheet rows for the same level collapse
 * into a single write.
 */
export interface LpPlan {
  id: string
  isNew: boolean
  completed: boolean
  create?: Prisma.LevelProgressCreateManyInput // mutated in place while isNew
  update: LpFields // accumulated while !isNew
  touched: boolean
}

interface BatchWrites {
  newLevelProgress: Prisma.LevelProgressCreateManyInput[]
  newProgressUpdates: Prisma.ProgressUpdateCreateManyInput[]
  progressUpdateUpdates: {
    id: string
    data: Prisma.ProgressUpdateUncheckedUpdateInput
  }[]
}

/**
 * Everything the per-row planners read and mutate: the batch's accumulated
 * writes, the plan-so-far per level, and the pre-loaded DB state they diff
 * against. Threaded through the planners instead of re-querying per row.
 */
export interface PlanCtx {
  userId: string
  writes: BatchWrites
  lpPlans: Map<string, LpPlan>
  dbState: Map<
    string,
    {
      id: string
      status: LpStatus
      completionId: string | null
      visibility: 'PUBLIC' | 'PRIVATE'
    }
  >
  levelDiff: Map<string, string | null>
  levelCoins: Map<string, number | null>
  // levelId → the calendar date (YYYY-MM-DD) that level's completion will
  // carry once this batch is written, or null when it has no completion (or
  // one with no date). A progress row dated after it is refused — see
  // planProgress. Precomputed per batch because a level's completion row can
  // sit anywhere in the batch, including after its progress rows.
  completionDateByLevel: Map<string, string | null>
  // progress_id → the existing ProgressUpdate it round-trips to (and the level
  // it belongs to, so a mismatched/foreign id falls back to creating new).
  existingProgress: Map<string, { id: string; levelId: string }>
  // drop_id → the existing kind=DROP ProgressUpdate it round-trips to. Same
  // shape/purpose as existingProgress, since drops are additive too.
  existingDrops: Map<string, { id: string; levelId: string }>
  // Fallback dedup for id-less progress/dropped rows (name-only rows resolve
  // too late to be pre-checked by /check) — levelId → that level's existing
  // PROGRESS (resp. DROP) kind rows, for derived-key matching at commit time.
  progressEventsByLevel: Map<string, ExistingEventSnapshot[]>
  dropEventsByLevel: Map<string, ExistingEventSnapshot[]>
}

/** An empty write accumulator for a fresh batch. */
export function newBatchWrites(): BatchWrites {
  return {
    newLevelProgress: [],
    newProgressUpdates: [],
    progressUpdateUpdates: [],
  }
}

/**
 * Find-or-create the single LevelProgress plan for a level. Shared so a
 * completion row and a drop row for the same level in one batch touch one LP.
 */
export function getLpPlan(ctx: PlanCtx, levelId: string): LpPlan {
  const existing = ctx.lpPlans.get(levelId)
  if (existing) return existing

  const db = ctx.dbState.get(levelId)
  let plan: LpPlan
  if (db) {
    plan = {
      id: db.id,
      isNew: false,
      completed: db.status === 'COMPLETED',
      update: {},
      touched: false,
    }
  } else {
    const create: Prisma.LevelProgressCreateManyInput = {
      id: randomUUID(),
      userId: ctx.userId,
      levelId,
      status: 'IN_PROGRESS',
    }
    ctx.writes.newLevelProgress.push(create)
    plan = {
      id: create.id!,
      isNew: true,
      completed: false,
      create,
      update: {},
      touched: false,
    }
  }
  ctx.lpPlans.set(levelId, plan)
  return plan
}

/**
 * Apply LevelProgress field changes — folded into the queued create for new
 * rows (no extra write), accumulated into a single update for existing rows.
 */
export function applyLp(plan: LpPlan, fields: LpFields): void {
  if (fields.status === 'COMPLETED') plan.completed = true
  if (plan.create) {
    Object.assign(plan.create, fields)
  } else {
    Object.assign(plan.update, fields)
    plan.touched = true
  }
}

// The complete ProgressUpdate field set for a completion — used for a
// brand-new row (create) and for a true 'overwrite' of an existing one. Every
// field is written unconditionally, including nulls (a blank sheet cell
// legitimately clears the existing value) — this is what makes 'overwrite' a
// real replace rather than the merge it used to be mislabeled as.
function buildCompletionProgressUpdateFields(
  row: ImportCompletionRow,
  inGameDifficulty: string | null
) {
  return {
    date: row.date ? new Date(row.date) : null,
    // Import rows never carry a real time-of-day — always nulled alongside
    // `date` so a previously-real-time value doesn't linger stale.
    dateTimezone: null,
    dateUncertain: row.dateUncertain ?? false,
    attempts: row.attempts ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
    fps: row.fps ?? null,
    onStream: row.onStream ?? false,
    videoUrl: row.videoUrl ?? null,
    highlightUrl: row.highlightUrl ?? null,
    notes: row.notes ?? null,
    enjoyment: row.enjoyment != null ? Math.round(row.enjoyment * 10) : null,
    twoPlayerSolo: row.twoPlayerSolo ?? null,
    twoPlayerPartner: row.twoPlayerPartner ?? null,
    device: row.device ?? null,
    inGameDifficulty,
  }
}

// The complete LevelProgress field set touched by a completion, for the
// unconditional (create / true-overwrite) write path. `visibility` is a
// non-nullable column, so a blank sheet cell (row.visibility == null) can't
// just be omitted — it falls back to `fallbackVisibility`, which callers set
// to the level's *existing* visibility when overwriting (a blank cell must
// not silently flip a private completion public) and to 'PUBLIC' only for a
// brand-new completion, which has no existing value to preserve.
function buildCompletionLpFields(
  row: ImportCompletionRow,
  resolvedFields: {
    userGddlTier: number | null
    coinsCollected: number | null
    fallbackVisibility?: 'PUBLIC' | 'PRIVATE'
  }
): LpFields {
  const {
    userGddlTier,
    coinsCollected,
    fallbackVisibility = 'PUBLIC',
  } = resolvedFields
  return {
    worstFail: row.percentage != null ? Math.round(row.percentage) : null,
    worstFailDate:
      row.worstFailDate != null ? new Date(row.worstFailDate) : null,
    worstFailDateTimezone: null,
    visibility: row.visibility ?? fallbackVisibility,
    levelNotes: row.levelNotes ?? null,
    userGddlTier,
    difficultyOpinion: row.difficultyOpinion ?? null,
    simpleRating:
      row.simpleRating != null ? Math.round(row.simpleRating * 10) : null,
    coinsCollected,
  }
}

// Partial field-by-field patch for 'merge' — only fields the sheet actually
// provides are written; a blank field keeps its existing InfernoLog value
// untouched. This is safe specifically because 'merge' rows arrive with
// every genuinely conflicting field already resolved to its winning value by
// the frontend (see FieldConflictMerge) — a field that's still blank here
// was never in conflict, so there's nothing to reconcile.
function buildCompletionMergePatch(
  row: ImportCompletionRow
): Prisma.ProgressUpdateUncheckedUpdateInput {
  const merge: Prisma.ProgressUpdateUncheckedUpdateInput = {}
  if (row.date != null) {
    merge.date = new Date(row.date)
    // Import rows never carry a real time-of-day — null the timezone
    // alongside date so a previously-real-time value doesn't linger stale.
    merge.dateTimezone = null
  }
  if (row.dateUncertain != null) merge.dateUncertain = row.dateUncertain
  if (row.attempts != null) merge.attempts = row.attempts
  if (row.fps != null) merge.fps = row.fps
  if (row.onStream != null) merge.onStream = row.onStream
  if (row.videoUrl != null) merge.videoUrl = row.videoUrl
  if (row.highlightUrl != null) merge.highlightUrl = row.highlightUrl
  if (row.notes != null) merge.notes = row.notes
  if (row.runFrom != null) merge.runFrom = row.runFrom
  if (row.runTo != null) merge.runTo = row.runTo
  if (row.enjoyment != null) merge.enjoyment = Math.round(row.enjoyment * 10)
  if (row.twoPlayerSolo != null) merge.twoPlayerSolo = row.twoPlayerSolo
  if (row.twoPlayerPartner != null)
    merge.twoPlayerPartner = row.twoPlayerPartner
  if (row.device != null) merge.device = row.device
  return merge
}

function buildCompletionMergeLpFields(
  row: ImportCompletionRow,
  resolvedFields: {
    userGddlTier: number | null
    coinsCollected: number | null
  }
): LpFields {
  const { userGddlTier, coinsCollected } = resolvedFields
  return {
    ...(row.percentage != null
      ? { worstFail: Math.round(row.percentage) }
      : {}),
    ...(row.worstFailDate != null
      ? {
          worstFailDate: new Date(row.worstFailDate),
          worstFailDateTimezone: null,
        }
      : {}),
    ...(row.visibility != null ? { visibility: row.visibility } : {}),
    ...(row.levelNotes != null ? { levelNotes: row.levelNotes } : {}),
    ...(userGddlTier != null ? { userGddlTier } : {}),
    ...(row.difficultyOpinion != null
      ? { difficultyOpinion: row.difficultyOpinion }
      : {}),
    ...(row.simpleRating != null
      ? { simpleRating: Math.round(row.simpleRating * 10) }
      : {}),
    ...(coinsCollected != null ? { coinsCollected } : {}),
  }
}

/**
 * Outcome-reporting text for a completion row's resolution.
 */
export function completionOutcomeReason(
  outcomeStatus: 'committed' | 'updated' | 'skipped',
  resolution: ImportConflictAction | undefined
): string | undefined {
  if (outcomeStatus === 'skipped') {
    if (resolution === 'drop') return 'Discarded during conflict review'
    return 'No changes — matches existing completion'
  }
  if (outcomeStatus === 'updated') {
    if (resolution === 'overwrite') return 'Overwritten'
    if (resolution === 'merge') return 'Merged'
  }
  return undefined
}

interface CompletionPlanResult {
  status: 'committed' | 'updated' | 'skipped'
  // Set when a completion is skipped because it conflicts with an existing
  // one and /check couldn't have pre-validated it (only possible for
  // name-only rows — see checkImportConflicts' `!row.data.levelId` skip) —
  // surfaced via the flagged-row review mechanism so the user knows their
  // data wasn't applied, instead of it silently vanishing. A row that DID
  // carry a levelId and reaches this same branch genuinely has no diff
  // (checkImportConflicts already filtered those out), so it's never flagged.
  flagged?: boolean
}

/**
 * Plans the writes for one imported completion row, without executing them.
 *
 * Decides create-vs-overwrite-vs-skip against the pre-loaded DB state, folds
 * the result into the batch's accumulated writes, and returns the row's outcome
 * for the review UI.
 *
 * @param ctx - The batch's shared planning context; mutated in place.
 * @param levelId - Resolved level for this row.
 * @param row - The validated completion row from the sheet.
 * @param resolution - The user's choice for this row when it was previously
 * flagged as a conflict; undefined on a first pass.
 * @param autoGddlTier - GDDL tier looked up for the level, when available.
 */
export function planCompletion(
  ctx: PlanCtx,
  levelId: string,
  row: ImportCompletionRow,
  resolution: ImportConflictAction | undefined,
  autoGddlTier: number | null,
  wasNameOnly: boolean
): CompletionPlanResult {
  const existingCompletionId = ctx.dbState.get(levelId)?.completionId ?? null

  // 'drop'/'duplicate' — discarded, either by the user or (not reachable for
  // completions today, but defensive) a system dedup.
  if (resolution === 'drop' || resolution === 'duplicate') {
    return { status: 'skipped' }
  }

  // An existing completion with no resolution at all normally means the
  // check pass found no field diff (the row is an unmodified re-import) —
  // nothing to reconcile. But for a name-only row, /check can never assign a
  // resolution (it skips rows with no levelId entirely), so this same branch
  // can also mean "this row actually conflicts and nobody got to review it" —
  // flag that case instead of discarding it silently.
  if (existingCompletionId && !resolution) {
    return { status: 'skipped', flagged: wasNameOnly }
  }

  // GDDL tier: explicit row value wins; else the autofilled value. Both are
  // rounded to a whole number — GDDL tiers are never stored as decimals.
  const userGddlTier: number | null =
    row.userGddlTier != null
      ? roundGddlTier(row.userGddlTier)
      : (autoGddlTier ?? null)

  // User-coin collection only applies to levels that actually have coins;
  // ignore the spreadsheet's coin columns otherwise (matches the logging flow).
  const hasCoins = (ctx.levelCoins.get(levelId) ?? 0) > 0
  const coinsCollected = hasCoins ? (row.coinsCollected ?? null) : null

  const plan = getLpPlan(ctx, levelId)

  if (existingCompletionId && resolution === 'merge') {
    const merge = buildCompletionMergePatch(row)
    if (Object.keys(merge).length > 0) {
      ctx.writes.progressUpdateUpdates.push({
        id: existingCompletionId,
        data: merge,
      })
    }
    const lpMerge = buildCompletionMergeLpFields(row, {
      userGddlTier,
      coinsCollected,
    })
    if (Object.keys(lpMerge).length > 0) applyLp(plan, lpMerge)
    return { status: 'updated' }
  }

  // Either a true 'overwrite' of an existing completion, or a brand-new one
  // (no existing row at all) — both write every field of `row` unconditionally.
  const fields = buildCompletionProgressUpdateFields(
    row,
    ctx.levelDiff.get(levelId) ?? null
  )

  if (existingCompletionId) {
    ctx.writes.progressUpdateUpdates.push({
      id: existingCompletionId,
      data: fields,
    })
    const existingVisibility = ctx.dbState.get(levelId)?.visibility ?? 'PUBLIC'
    applyLp(
      plan,
      buildCompletionLpFields(row, {
        userGddlTier,
        coinsCollected,
        fallbackVisibility: existingVisibility,
      })
    )
    return { status: 'updated' }
  }

  const puId = randomUUID()
  ctx.writes.newProgressUpdates.push({
    id: puId,
    levelProgressId: plan.id,
    kind: 'COMPLETION',
    ...fields,
  })
  applyLp(plan, {
    status: 'COMPLETED',
    ...buildCompletionLpFields(row, { userGddlTier, coinsCollected }),
  })

  return { status: 'committed' }
}
