// Spreadsheet import service — commit logic for POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop
// writes, cross-tab reconciliation (completion + drop for same level),
// conflict resolution, idempotency via (importJobId, rowIndex) keys,
// name-based level resolution, and GDDL tier autofill.

import { randomUUID } from 'node:crypto'
import prisma from '../utils/prisma'
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs'
import type { Prisma } from '@prisma/client'
import type {
  ImportCompletionRow,
  ImportProgressRow,
  ImportDroppedRow,
  ImportCommitRow,
  ImportCommitResponse,
  ImportConflictAction,
  ImportFieldDiff,
  ImportRowConflict,
  ImportDuplicateRow,
  ImportCheckRequest,
  ImportCheckResponse,
} from '@infernolog/core'
import { logger } from '../utils/logger'
import { searchRobtopByName, type RobtopLevel } from '../utils/robtop'
import { fetchGddlTier, roundGddlTier } from '../utils/gddl'
import { removeFromWantToBeat } from './collections'
import { checkRatingConflicts } from './importRatings'
import { checkCollectionsMerge } from './importCollections'
import { checkRankingMerge } from './importRanking'

type Tx = Prisma.TransactionClient

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

// ── Name-based level resolution ────────────────────────────────────────────

// Demon tier names, keyed without the redundant "Demon" suffix. InfernoLog only
// tracks demon completions, so spreadsheet in_game_difficulty values are always a
// demon tier — written either bare ("Easy") or suffixed ("Easy Demon"). Levels in
// our DB always store the suffixed form (see deriveDifficulty in robtop.ts), so
// both sides are normalized through this before comparing.
const DEMON_TIER_FILTERS: Record<string, string> = {
  easy: '1',
  medium: '2',
  hard: '3',
  insane: '4',
  extreme: '5',
}

function normalizeTier(diff: string | null | undefined): string | null {
  if (!diff) return null
  return (
    diff
      .toLowerCase()
      .replace(/\s*demon\s*$/, '')
      .trim() || null
  )
}

// Maps a human-readable inGameDifficulty label to GD search API diff/demonFilter params.
function toDiffFilter(diff: string | null | undefined): {
  diff?: string
  demonFilter?: string
} {
  const tier = normalizeTier(diff)
  if (!tier) return {}
  const demonFilter = DEMON_TIER_FILTERS[tier]
  if (!demonFilter) return {}
  return { diff: '-2', demonFilter }
}

// Builds a hard difficulty predicate from the spreadsheet's in_game_difficulty.
// InfernoLog only tracks demons, so a value like "Easy" means "Easy Demon" — a
// known non-demon / auto / unrated level (or a demon of a different tier) must
// NOT match. Returns null when the value isn't a recognized demon tier, in which
// case difficulty is simply not used to filter. A candidate whose own difficulty
// is unknown (null — e.g. an un-enriched stub) is given the benefit of the doubt.
function demonTierPredicate(
  inGameDifficulty: string | null | undefined
): ((levelDiff: string | null) => boolean) | null {
  const tier = normalizeTier(inGameDifficulty)
  if (!tier || !DEMON_TIER_FILTERS[tier]) return null
  return (levelDiff) => {
    if (levelDiff == null) return true
    const d = levelDiff.toLowerCase()
    return d.includes('demon') && normalizeTier(d) === tier
  }
}

// Resolves a level ID from its name, checking InfernoLog's cache first then
// falling back to a live RobTop name search. Returns:
//   { levelId, robtopLevel? } — unique match (robtopLevel present when found via RobTop)
//   'ambiguous'               — multiple candidates even after creator/difficulty filtering
//   null                      — no match found anywhere
export type ResolveResult =
  | { levelId: string; robtopLevel?: RobtopLevel }
  | 'ambiguous'
  | null

type DbCandidate = {
  inGameId: string
  creator: string | null
  inGameDifficulty: string | null
}

// Resolve from already-fetched DB candidates for a name. Returns a unique match,
// 'ambiguous', or null (no DB match → caller should try RobTop).
function resolveFromDbCandidates(
  dbLevels: DbCandidate[],
  creator: string | null | undefined,
  inGameDifficulty: string | null | undefined
): { levelId: string } | 'ambiguous' | null {
  const matchesTier = demonTierPredicate(inGameDifficulty)
  let candidates = dbLevels
  // Difficulty is a hard filter (applied even when it empties the list, so the
  // wrong-difficulty single match falls through to RobTop instead of resolving).
  if (matchesTier)
    candidates = candidates.filter((l) => matchesTier(l.inGameDifficulty))
  // Creator is a lenient tiebreaker only (the column is fuzzy / often blank).
  if (creator && candidates.length > 1) {
    const hint = creator.toLowerCase()
    const filtered = candidates.filter((l) =>
      l.creator?.toLowerCase().includes(hint)
    )
    if (filtered.length > 0) candidates = filtered
  }
  if (candidates.length === 1) return { levelId: candidates[0]!.inGameId }
  if (candidates.length > 1) return 'ambiguous'
  return null
}

// RobTop fallback (step 2) for a single name. Filters to exact-name matches (the
// search is keyword-based) and re-applies the difficulty filter. We do NOT fall
// back to an unfiltered search — the wrong level is worse than a clear failure.
async function resolveViaRobtop(
  name: string,
  creator: string | null | undefined,
  inGameDifficulty: string | null | undefined
): Promise<ResolveResult> {
  const matchesTier = demonTierPredicate(inGameDifficulty)
  const rtResults = await searchRobtopByName(
    name,
    toDiffFilter(inGameDifficulty)
  )
  // Compare trimmed: RobTop stores some names with trailing/leading whitespace.
  const wantName = name.trim().toLowerCase()
  let rtCandidates = rtResults.filter(
    (r) => r.level.name?.trim().toLowerCase() === wantName
  )
  if (matchesTier) {
    rtCandidates = rtCandidates.filter((r) =>
      matchesTier(r.level.inGameDifficulty)
    )
  }
  if (creator && rtCandidates.length > 1) {
    const hint = creator.toLowerCase()
    const filtered = rtCandidates.filter((r) =>
      r.level.creator?.toLowerCase().includes(hint)
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

export async function resolveByName(
  name: string,
  creator?: string | null,
  inGameDifficulty?: string | null
): Promise<ResolveResult> {
  // 1. Check the local cache first, then fall back to RobTop.
  const dbLevels = await prisma.level.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { inGameId: true, creator: true, inGameDifficulty: true },
  })
  const db = resolveFromDbCandidates(dbLevels, creator, inGameDifficulty)
  if (db) return db // unique match or 'ambiguous'
  return resolveViaRobtop(name, creator, inGameDifficulty)
}

// Bulk name resolution: fetches all DB candidates in a few queries (grouped by
// lowercased name) rather than one query per name, then falls back to RobTop
// only for the DB misses. Keeps the DB-first ordering for a large one-shot
// import (e.g. a Lists tab with thousands of name-only rows). Returns results
// positionally aligned with `inputs`.
export async function resolveNamesBatch(
  inputs: {
    name: string
    creator?: string | null | undefined
    inGameDifficulty?: string | null | undefined
  }[]
): Promise<ResolveResult[]> {
  const distinct = [...new Set(inputs.map((i) => i.name.trim().toLowerCase()))]
  const byName = new Map<string, DbCandidate[]>()

  const CHUNK = 200
  for (let i = 0; i < distinct.length; i += CHUNK) {
    const chunk = distinct.slice(i, i + CHUNK)
    const rows = await prisma.level.findMany({
      where: {
        OR: chunk.map((n) => ({
          name: { equals: n, mode: 'insensitive' as const },
        })),
      },
      select: {
        inGameId: true,
        name: true,
        creator: true,
        inGameDifficulty: true,
      },
    })
    for (const r of rows) {
      const key = (r.name ?? '').trim().toLowerCase()
      const list = byName.get(key)
      if (list) list.push(r)
      else byName.set(key, [r])
    }
  }

  const results: ResolveResult[] = []
  for (const input of inputs) {
    const dbLevels = byName.get(input.name.trim().toLowerCase()) ?? []
    const db = resolveFromDbCandidates(
      dbLevels,
      input.creator,
      input.inGameDifficulty
    )
    // DB miss → RobTop fallback (sequential; only for unseeded levels).
    results.push(
      db ??
        (await resolveViaRobtop(
          input.name,
          input.creator,
          input.inGameDifficulty
        ))
    )
  }
  return results
}

// ── Stub level creation ────────────────────────────────────────────────────

export async function ensureStubLevels(
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

export async function enqueueSeedIds(levelIds: string[]): Promise<void> {
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

// ── Write planning (in-memory) ─────────────────────────────────────────────
//
// Neon's serverless driver makes every `tx.*` call a network round-trip, so a
// 50-row batch of per-row reads+writes inside one interactive transaction blew
// past Prisma's transaction timeout (the "Transaction not found" error). We now
// PLAN every write in memory first — generating UUIDs application-side so we
// never need a round-trip to learn a generated id — then flush the plan as a
// handful of batched createMany/deleteMany calls plus the few genuinely per-row
// updates (status changes and overwrites).

type LpStatus = 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'

interface LpFields {
  status?: LpStatus
  // Nullable (not just optional) so a full overwrite can explicitly clear a
  // field the sheet leaves blank, rather than only ever being able to omit it.
  worstFail?: number | null
  worstFailDate?: Date | null
  visibility?: 'PUBLIC' | 'PRIVATE'
  levelNotes?: string | null
  userGddlTier?: number | null
  // One current value per level, not per event — see schema.prisma.
  simpleRating?: number | null
  coinsCollected?: number | null
}

interface LpPlan {
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

interface PlanCtx {
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

function newBatchWrites(): BatchWrites {
  return {
    newLevelProgress: [],
    newProgressUpdates: [],
    progressUpdateUpdates: [],
  }
}

// Find-or-create the single LevelProgress plan for a level. Shared so a
// completion row and a drop row for the same level in one batch touch one LP.
function getLpPlan(ctx: PlanCtx, levelId: string): LpPlan {
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

// Apply LevelProgress field changes — folded into the queued create for new
// rows (no extra write), accumulated into a single update for existing rows.
function applyLp(plan: LpPlan, fields: LpFields): void {
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
    difficultyOpinion: row.difficultyOpinion ?? null,
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
  userGddlTier: number | null,
  coinsCollected: number | null,
  fallbackVisibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC'
): LpFields {
  return {
    worstFail: row.percentage != null ? Math.round(row.percentage) : null,
    worstFailDate:
      row.worstFailDate != null ? new Date(row.worstFailDate) : null,
    visibility: row.visibility ?? fallbackVisibility,
    levelNotes: row.levelNotes ?? null,
    userGddlTier,
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
  if (row.date != null) merge.date = new Date(row.date)
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
  if (row.difficultyOpinion != null)
    merge.difficultyOpinion = row.difficultyOpinion
  if (row.twoPlayerSolo != null) merge.twoPlayerSolo = row.twoPlayerSolo
  if (row.twoPlayerPartner != null)
    merge.twoPlayerPartner = row.twoPlayerPartner
  if (row.device != null) merge.device = row.device
  return merge
}

function buildCompletionMergeLpFields(
  row: ImportCompletionRow,
  userGddlTier: number | null,
  coinsCollected: number | null
): LpFields {
  return {
    ...(row.percentage != null
      ? { worstFail: Math.round(row.percentage) }
      : {}),
    ...(row.worstFailDate != null
      ? { worstFailDate: new Date(row.worstFailDate) }
      : {}),
    ...(row.visibility != null ? { visibility: row.visibility } : {}),
    ...(row.levelNotes != null ? { levelNotes: row.levelNotes } : {}),
    ...(userGddlTier != null ? { userGddlTier } : {}),
    ...(row.simpleRating != null
      ? { simpleRating: Math.round(row.simpleRating * 10) }
      : {}),
    ...(coinsCollected != null ? { coinsCollected } : {}),
  }
}

// Outcome-reporting text for a completion row's resolution.
function completionOutcomeReason(
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

function planCompletion(
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
    const lpMerge = buildCompletionMergeLpFields(
      row,
      userGddlTier,
      coinsCollected
    )
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
      buildCompletionLpFields(
        row,
        userGddlTier,
        coinsCollected,
        existingVisibility
      )
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
    ...buildCompletionLpFields(row, userGddlTier, coinsCollected),
  })

  return { status: 'committed' }
}

// ── Progress/Dropped shared helpers ─────────────────────────────────────────
//
// Progress and Dropped round-trip by an explicit progress_id/drop_id when
// present (the branches below keyed off `matched` — unrelated to conflict
// resolution, unchanged from before this rework). When absent, a row could
// still describe an event that already exists (an unmodified export missing
// its id column, or a hand-added duplicate) — silently creating a new entry
// every time would duplicate history on every reimport. The derived key is
// (date, percentage, runFrom, runTo): ALL must match exactly, including both
// sides being null — a 43-100 run and a flat 35% reading on the same day are
// different events, not the same one recorded two ways. This only runs as a
// commit-time fallback for rows /check couldn't pre-resolve (name-only rows
// resolve their level too late to be pre-checked) — see matchExistingEvent.

const isoDate = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 10) : null

type DecimalLike = { toNumber(): number }
const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()

interface ExistingEventSnapshot {
  id: string
  levelId: string
  date: Date | null
  dateUncertain: boolean
  attempts: number | null
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  fps: number | null
  onStream: boolean
  highlightUrl: string | null
  notes: string | null
  enjoyment: number | null // internal 0-100
  device: string | null
}

// Batch-fetches every existing PROGRESS (resp. DROP) row for the given
// levels — both checkImportConflicts (pre-check) and processImportJobBatch
// (commit-time fallback) need the same shape, just at different call sites.
async function fetchExistingEvents(
  userId: string,
  kind: 'PROGRESS' | 'DROP',
  levelIds: string[]
): Promise<ExistingEventSnapshot[]> {
  if (!levelIds.length) return []
  const rows = await prisma.progressUpdate.findMany({
    where: { kind, levelProgress: { userId, levelId: { in: levelIds } } },
    select: {
      id: true,
      date: true,
      dateUncertain: true,
      attempts: true,
      percentage: true,
      runFrom: true,
      runTo: true,
      fps: true,
      onStream: true,
      highlightUrl: true,
      notes: true,
      enjoyment: true,
      device: true,
      levelProgress: { select: { levelId: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    levelId: r.levelProgress.levelId,
    date: r.date,
    dateUncertain: r.dateUncertain,
    attempts: r.attempts,
    percentage: toNum(r.percentage),
    runFrom: r.runFrom,
    runTo: r.runTo,
    fps: r.fps,
    onStream: r.onStream,
    highlightUrl: r.highlightUrl,
    notes: r.notes,
    enjoyment: r.enjoyment,
    device: r.device,
  }))
}

function groupByLevel(
  events: ExistingEventSnapshot[]
): Map<string, ExistingEventSnapshot[]> {
  const byLevel = new Map<string, ExistingEventSnapshot[]>()
  for (const e of events) {
    const list = byLevel.get(e.levelId)
    if (list) list.push(e)
    else byLevel.set(e.levelId, [e])
  }
  return byLevel
}

// The derived key as a plain string, for both grouping (intra-batch
// supersession) and matching (against existing DB rows). A row with none of
// the four fields set carries no distinguishing session data — treated as
// "no key" so a batch of otherwise-blank rows never falsely supersedes or
// dedupes against each other.
function deriveEventKey(fields: {
  date: string | null
  percentage: number | null
  runFrom: number | null
  runTo: number | null
}): string | null {
  if (
    fields.date == null &&
    fields.percentage == null &&
    fields.runFrom == null &&
    fields.runTo == null
  ) {
    return null
  }
  return `${fields.date ?? ''}|${fields.percentage ?? ''}|${fields.runFrom ?? ''}|${fields.runTo ?? ''}`
}

// A field is a diff only when the sheet actually provides a value (null
// means "left blank" — auto-resolves to the existing value) AND that value
// differs from what's already stored. Shared by every per-tab field-diff
// function below (progress/dropped/completion) — the skip rule itself never
// varies, only which fields get compared.
function createFieldPusher(diffs: ImportFieldDiff[]) {
  return (field: string, existingValue: unknown, importedValue: unknown) => {
    if (importedValue == null) return
    if (importedValue === existingValue) return
    diffs.push({ field, existingValue, importedValue })
  }
}

function diffProgressFields(
  existing: ExistingEventSnapshot,
  row: ImportProgressRow
): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = []
  const push = createFieldPusher(diffs)
  push('date', isoDate(existing.date), row.date ?? null)
  push('dateUncertain', existing.dateUncertain, row.dateUncertain ?? null)
  push('attempts', existing.attempts, row.attempts ?? null)
  push('percentage', existing.percentage, row.percentage ?? null)
  push('runFrom', existing.runFrom, row.runFrom ?? null)
  push('runTo', existing.runTo, row.runTo ?? null)
  push('fps', existing.fps, row.fps ?? null)
  push('onStream', existing.onStream, row.onStream ?? null)
  push('highlightUrl', existing.highlightUrl, row.highlightUrl ?? null)
  push('notes', existing.notes, row.notes ?? null)
  push(
    'enjoyment',
    existing.enjoyment != null ? existing.enjoyment / 10 : null,
    row.enjoyment ?? null
  )
  push('device', existing.device, row.device ?? null)
  return diffs
}

function diffDroppedFields(
  existing: ExistingEventSnapshot,
  row: ImportDroppedRow
): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = []
  const push = createFieldPusher(diffs)
  push('droppedAt', isoDate(existing.date), row.droppedAt ?? null)
  push('bestProgress', existing.percentage, row.bestProgress ?? null)
  push('runFrom', existing.runFrom, row.runFrom ?? null)
  push('runTo', existing.runTo, row.runTo ?? null)
  push('attemptsAtDrop', existing.attempts, row.attemptsAtDrop ?? null)
  push('reason', existing.notes, row.reason ?? null)
  return diffs
}

// Commit-time fallback dedup for a row with no explicit progress_id/drop_id.
// 'exact' — every field agrees, a true no-op duplicate. 'partial' — the
// derived key matched but something else differs (created anyway and
// flagged for review — see planProgress/planDrop). null — no match at all.
function matchExistingEvent(
  eventsByLevel: Map<string, ExistingEventSnapshot[]>,
  levelId: string,
  key: string | null,
  diff: (existing: ExistingEventSnapshot) => ImportFieldDiff[]
): 'exact' | 'partial' | null {
  if (key == null) return null
  const candidates = eventsByLevel.get(levelId)
  if (!candidates) return null
  // Scan every same-key candidate rather than stopping at the first: a level
  // can legitimately have more than one PROGRESS/DROP row sharing a derived
  // key (same date/percentage/run range, different notes/attempts), so
  // returning on the first match risked classifying a genuine exact
  // duplicate as merely 'partial' whenever a differing same-key row happened
  // to come back from the DB first (no ORDER BY guarantees that order).
  let sawPartial = false
  for (const existing of candidates) {
    const existingKey = deriveEventKey({
      date: isoDate(existing.date),
      percentage: existing.percentage,
      runFrom: existing.runFrom,
      runTo: existing.runTo,
    })
    if (existingKey !== key) continue
    if (diff(existing).length === 0) return 'exact'
    sawPartial = true
  }
  return sawPartial ? 'partial' : null
}

function eventOutcomeReason(
  outcomeStatus: 'committed' | 'updated' | 'skipped',
  resolution: ImportConflictAction | undefined
): string | undefined {
  if (outcomeStatus === 'skipped') {
    if (resolution === 'drop') return 'Discarded during conflict review'
    if (resolution === 'duplicate') return 'Duplicate of an existing entry'
    return undefined
  }
  if (outcomeStatus === 'updated') {
    if (resolution === 'overwrite') return 'Overwritten'
    if (resolution === 'merge') return 'Merged'
  }
  return undefined
}

interface EventPlanResult {
  status: 'committed' | 'updated' | 'skipped'
  reason?: string | undefined
  // A 'committed' row that's a possible (non-exact) duplicate the pre-check
  // couldn't catch — created anyway (never silently dropped — an incoming
  // row might genuinely be new data that happens to share a derived key) but
  // surfaced via the flagged-row review mechanism.
  flagged?: boolean
}

// Shared translation of matchExistingEvent's dedup verdict, used by both
// planDrop and planProgress's derived-key fallback path. 'exact' always
// skips before any write happens, so it's returned directly; 'partial'/null
// are resolved into a final result AFTER the caller performs its own write
// (the write itself is the only part that genuinely differs between a drop
// and a progress row, so it isn't folded into these helpers).
function exactDuplicateSkip(): EventPlanResult {
  return { status: 'skipped', reason: 'Duplicate of an existing entry' }
}

function committedDedupResult(
  dedup: 'partial' | null,
  possibleDuplicateReason: string
): EventPlanResult {
  return dedup === 'partial'
    ? { status: 'committed', reason: possibleDuplicateReason, flagged: true }
    : { status: 'committed' }
}

// A drop event, backed by its own progress_update (kind=DROP). Additive, like
// Progress — a level can be dropped more than once (drop → resume → drop
// again). Round-trips by `dropId` when present (unrelated to conflict
// resolution — the pre-existing, unchanged behavior); otherwise resolved via
// `resolution` (arrived from conflict review, matchedId already folded into
// `dropId` by the frontend) or the derived-key fallback dedup above.
function planDrop(
  ctx: PlanCtx,
  levelId: string,
  row: ImportDroppedRow,
  resolution: ImportConflictAction | undefined
): EventPlanResult {
  if (resolution === 'drop' || resolution === 'duplicate') {
    return {
      status: 'skipped',
      reason: eventOutcomeReason('skipped', resolution),
    }
  }

  const matched = row.dropId ? ctx.existingDrops.get(row.dropId) : undefined
  const plan = getLpPlan(ctx, levelId)

  if (matched && matched.levelId === levelId) {
    if (resolution === 'overwrite') {
      const fields = {
        date: row.droppedAt ? new Date(row.droppedAt) : null,
        attempts: row.attemptsAtDrop ?? null,
        notes: row.reason ?? null,
        percentage: row.bestProgress ?? null,
        runFrom: row.runFrom ?? null,
        runTo: row.runTo ?? null,
      }
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: fields })
      if (row.bestProgress != null) {
        applyLp(plan, { worstFail: Math.round(row.bestProgress) })
      }
      if (!plan.completed) applyLp(plan, { status: 'DROPPED' })
      return { status: 'updated', reason: 'Overwritten' }
    }

    // resolution === 'merge', or absent (ordinary id round-trip) — only the
    // fields the sheet provides are written, same shape either way.
    const merge: Prisma.ProgressUpdateUncheckedUpdateInput = {}
    if (row.droppedAt != null) merge.date = new Date(row.droppedAt)
    if (row.attemptsAtDrop != null) merge.attempts = row.attemptsAtDrop
    if (row.reason != null) merge.notes = row.reason
    if (row.bestProgress != null) merge.percentage = row.bestProgress
    if (row.runFrom != null) merge.runFrom = row.runFrom
    if (row.runTo != null) merge.runTo = row.runTo
    if (Object.keys(merge).length > 0) {
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: merge })
    }
    if (row.bestProgress != null) {
      applyLp(plan, { worstFail: Math.round(row.bestProgress) })
    }
    if (!plan.completed) applyLp(plan, { status: 'DROPPED' })
    return {
      status: 'updated',
      reason: resolution === 'merge' ? 'Merged' : undefined,
    }
  }

  const key = deriveEventKey({
    date: row.droppedAt ?? null,
    percentage: row.bestProgress ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
  })
  const dedup = matchExistingEvent(ctx.dropEventsByLevel, levelId, key, (e) =>
    diffDroppedFields(e, row)
  )
  if (dedup === 'exact') return exactDuplicateSkip()

  const puId = randomUUID()
  ctx.writes.newProgressUpdates.push({
    id: puId,
    levelProgressId: plan.id,
    kind: 'DROP',
    date: row.droppedAt ? new Date(row.droppedAt) : null,
    attempts: row.attemptsAtDrop ?? null,
    notes: row.reason ?? null,
    percentage: row.bestProgress ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
    inGameDifficulty: ctx.levelDiff.get(levelId) ?? null,
  })
  applyLp(plan, {
    status: plan.completed ? 'COMPLETED' : 'DROPPED',
    ...(row.bestProgress != null
      ? { worstFail: Math.round(row.bestProgress) }
      : {}),
  })
  return committedDedupResult(
    dedup,
    'Possible duplicate — re-import with a drop_id column to resolve automatically'
  )
}

// A non-completion progress log. Unlike completions/drops, many rows can
// legitimately target the same level (session history) — so there is no
// "existing entry" to skip or overwrite by level. Round-trips by
// `progressId` when present (unrelated to conflict resolution — the
// pre-existing, unchanged behavior); otherwise resolved via `resolution` or
// the derived-key fallback dedup above. Never touches LevelProgress.status —
// completions/drops establish status, and historical progress rows must not
// flip a dropped level back to in-progress on reimport.
function planProgress(
  ctx: PlanCtx,
  levelId: string,
  row: ImportProgressRow,
  resolution: ImportConflictAction | undefined
): EventPlanResult {
  if (resolution === 'drop' || resolution === 'duplicate') {
    return {
      status: 'skipped',
      reason: eventOutcomeReason('skipped', resolution),
    }
  }

  const matched = row.progressId
    ? ctx.existingProgress.get(row.progressId)
    : undefined
  const plan = getLpPlan(ctx, levelId)

  if (matched && matched.levelId === levelId) {
    if (resolution === 'overwrite') {
      const fields = {
        date: row.date ? new Date(row.date) : null,
        dateUncertain: row.dateUncertain ?? false,
        attempts: row.attempts ?? null,
        percentage: row.percentage ?? null,
        runFrom: row.runFrom ?? null,
        runTo: row.runTo ?? null,
        fps: row.fps ?? null,
        onStream: row.onStream ?? false,
        highlightUrl: row.highlightUrl ?? null,
        notes: row.notes ?? null,
        enjoyment:
          row.enjoyment != null ? Math.round(row.enjoyment * 10) : null,
        device: row.device ?? null,
      }
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: fields })
      if (row.visibility != null) applyLp(plan, { visibility: row.visibility })
      return { status: 'updated', reason: 'Overwritten' }
    }

    // resolution === 'merge', or absent (ordinary id round-trip) — only the
    // fields the sheet provides are written, same shape either way.
    const merge: Prisma.ProgressUpdateUncheckedUpdateInput = {}
    if (row.date != null) merge.date = new Date(row.date)
    if (row.dateUncertain != null) merge.dateUncertain = row.dateUncertain
    if (row.attempts != null) merge.attempts = row.attempts
    if (row.percentage != null) merge.percentage = row.percentage
    if (row.runFrom != null) merge.runFrom = row.runFrom
    if (row.runTo != null) merge.runTo = row.runTo
    if (row.fps != null) merge.fps = row.fps
    if (row.onStream != null) merge.onStream = row.onStream
    if (row.highlightUrl != null) merge.highlightUrl = row.highlightUrl
    if (row.notes != null) merge.notes = row.notes
    if (row.enjoyment != null) merge.enjoyment = Math.round(row.enjoyment * 10)
    if (row.device != null) merge.device = row.device
    if (Object.keys(merge).length > 0) {
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: merge })
    }
    if (row.visibility != null) applyLp(plan, { visibility: row.visibility })
    return {
      status: 'updated',
      reason: resolution === 'merge' ? 'Merged' : undefined,
    }
  }

  const key = deriveEventKey({
    date: row.date ?? null,
    percentage: row.percentage ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
  })
  const dedup = matchExistingEvent(
    ctx.progressEventsByLevel,
    levelId,
    key,
    (e) => diffProgressFields(e, row)
  )
  if (dedup === 'exact') return exactDuplicateSkip()

  const puId = randomUUID()
  ctx.writes.newProgressUpdates.push({
    id: puId,
    levelProgressId: plan.id,
    kind: 'PROGRESS',
    date: row.date ? new Date(row.date) : null,
    dateUncertain: row.dateUncertain ?? false,
    attempts: row.attempts ?? null,
    percentage: row.percentage ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
    fps: row.fps ?? null,
    onStream: row.onStream ?? false,
    highlightUrl: row.highlightUrl ?? null,
    notes: row.notes ?? null,
    enjoyment: row.enjoyment != null ? Math.round(row.enjoyment * 10) : null,
    device: row.device ?? null,
    inGameDifficulty: ctx.levelDiff.get(levelId) ?? null,
  })
  if (row.visibility != null) applyLp(plan, { visibility: row.visibility })
  return committedDedupResult(
    dedup,
    'Possible duplicate — re-import with a progress_id column to resolve automatically'
  )
}

// ── Main commit function ───────────────────────────────────────────────────
//
// Processes one batch of a background ImportJob's rows. Rows are pre-inserted
// as ImportJobRow("pending") by POST /v1/me/import/start; this function is
// called by the worker Lambda (importWorker.ts) with the next up-to-50
// pending rows fetched from the DB, and writes each row's final outcome back
// in place (update, not create) — there is no separate idempotency table
// anymore, since only the worker (never the client) drives this.

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
        select: { id: true },
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

  const levelRows = await prisma.level.findMany({
    where: { inGameId: { in: allKnownIds } },
    select: { inGameId: true, inGameDifficulty: true, coins: true },
  })
  const levelDiff = new Map<string, string | null>(
    levelRows.map((l) => [l.inGameId, l.inGameDifficulty])
  )
  const levelCoins = new Map<string, number | null>(
    levelRows.map((l) => [l.inGameId, l.coins])
  )
  // Name-resolved levels are created/enriched as stubs below; surface their
  // RobTop difficulty + coin count now for the completion snapshot / coin gate.
  for (const [id, rt] of resolvedRobtopData) {
    levelDiff.set(id, rt.inGameDifficulty)
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
  const ctx: PlanCtx = {
    userId,
    writes,
    lpPlans,
    dbState,
    levelDiff,
    levelCoins,
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
              downloads: rtData.downloads,
              likes: rtData.likes,
              disliked: rtData.disliked,
              objectCount: rtData.objectCount,
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

// Synchronous single-shot commit helper: creates the job, inserts its rows as
// "pending", and processes them in one call via processImportJobBatch. This is
// what the background worker's per-batch loop reduces to for a small,
// single-batch import — used directly by tests (and any other in-process
// caller) that want the full plan/write logic without going through
// POST /v1/me/import/start + an async Lambda invoke.
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

// ── Check function ─────────────────────────────────────────────────────────

// The subset of an existing completion's data that can conflict with an
// imported completion row — one field per column `buildCompletionProgressUpdateFields`/
// `buildCompletionLpFields` can write.
interface ExistingCompletionSnapshot {
  date: Date | null
  dateUncertain: boolean
  attempts: number | null
  runFrom: number | null
  runTo: number | null
  fps: number | null
  onStream: boolean
  videoUrl: string | null
  highlightUrl: string | null
  notes: string | null
  enjoyment: number | null // internal 0-100
  simpleRating: number | null // internal 0-100
  difficultyOpinion: string | null
  coinsCollected: number | null
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string | null
  device: string | null
  worstFail: number | null
  worstFailDate: Date | null
  visibility: string
  levelNotes: string | null
  userGddlTier: number | null
}

// A field is a diff only when the sheet actually provides a value (null
// means "left blank" — auto-resolves to the existing value, nothing to
// reconcile) AND that value differs from what's already stored. Equal
// values auto-resolve trivially too. This mirrors the transformations
// buildCompletionProgressUpdateFields/buildCompletionLpFields apply on write,
// so a diff here is exactly "this field would actually change."
function diffCompletionFields(
  existing: ExistingCompletionSnapshot,
  row: ImportCompletionRow,
  hasCoins: boolean
): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = []
  const push = createFieldPusher(diffs)

  push('date', isoDate(existing.date), row.date ?? null)
  push('dateUncertain', existing.dateUncertain, row.dateUncertain ?? null)
  push('attempts', existing.attempts, row.attempts ?? null)
  push('runFrom', existing.runFrom, row.runFrom ?? null)
  push('runTo', existing.runTo, row.runTo ?? null)
  push('fps', existing.fps, row.fps ?? null)
  push('onStream', existing.onStream, row.onStream ?? null)
  push('videoUrl', existing.videoUrl, row.videoUrl ?? null)
  push('highlightUrl', existing.highlightUrl, row.highlightUrl ?? null)
  push('notes', existing.notes, row.notes ?? null)
  // enjoyment/simpleRating are reported on the wire's 0-10 scale (matching
  // ImportCompletionRow), not the internal 0-100 storage scale — a resolved
  // 'existing' choice gets written straight back into `row.data` with no
  // further conversion, so the diff value and the row's own field must
  // already agree on scale.
  push(
    'enjoyment',
    existing.enjoyment != null ? existing.enjoyment / 10 : null,
    row.enjoyment ?? null
  )
  push(
    'simpleRating',
    existing.simpleRating != null ? existing.simpleRating / 10 : null,
    row.simpleRating ?? null
  )
  push(
    'difficultyOpinion',
    existing.difficultyOpinion,
    row.difficultyOpinion ?? null
  )
  push(
    'coinsCollected',
    existing.coinsCollected,
    hasCoins ? (row.coinsCollected ?? null) : null
  )
  push('twoPlayerSolo', existing.twoPlayerSolo, row.twoPlayerSolo ?? null)
  push(
    'twoPlayerPartner',
    existing.twoPlayerPartner,
    row.twoPlayerPartner ?? null
  )
  push('device', existing.device, row.device ?? null)
  push(
    'worstFail',
    existing.worstFail,
    row.percentage != null ? Math.round(row.percentage) : null
  )
  push(
    'worstFailDate',
    isoDate(existing.worstFailDate),
    row.worstFailDate ?? null
  )
  push('visibility', existing.visibility, row.visibility ?? null)
  push('levelNotes', existing.levelNotes, row.levelNotes ?? null)
  push(
    'userGddlTier',
    existing.userGddlTier,
    row.userGddlTier != null ? roundGddlTier(row.userGddlTier) : null
  )

  return diffs
}

// Shared conflict-scan for the progress/dropped derived-key dedup pre-check:
// for each row with a derivable key, scan every existing PROGRESS/DROP row on
// that level and classify it as an exact duplicate (a zero-diff match — no
// conflict to show) or a partial conflict (same key, some other field
// differs — surfaced for the user to resolve). Scans every same-key
// candidate rather than stopping at the first, mirroring the fix in
// matchExistingEvent above, for the same reason: an exact match elsewhere in
// the list must not be shadowed by an earlier partial one.
function scanForConflicts<
  Row extends {
    rowIndex: number
    data: {
      levelId?: string | null | undefined
      levelName?: string | null | undefined
    }
  },
>(
  rows: Row[],
  eventsByLevel: Map<string, ExistingEventSnapshot[]>,
  ops: {
    keyOf: (row: Row) => string | null
    diffOf: (existing: ExistingEventSnapshot, row: Row) => ImportFieldDiff[]
  }
): { conflicts: ImportRowConflict[]; duplicates: ImportDuplicateRow[] } {
  const conflicts: ImportRowConflict[] = []
  const duplicates: ImportDuplicateRow[] = []
  for (const row of rows) {
    const levelId = row.data.levelId!
    const key = ops.keyOf(row)
    if (key == null) continue
    const candidates = eventsByLevel.get(levelId) ?? []
    let bestPartial: {
      existing: ExistingEventSnapshot
      fields: ImportFieldDiff[]
    } | null = null
    let exact = false
    for (const existing of candidates) {
      const existingKey = deriveEventKey({
        date: isoDate(existing.date),
        percentage: existing.percentage,
        runFrom: existing.runFrom,
        runTo: existing.runTo,
      })
      if (existingKey !== key) continue
      const fields = ops.diffOf(existing, row)
      if (fields.length === 0) {
        exact = true
        break
      }
      if (!bestPartial) bestPartial = { existing, fields }
    }
    if (exact) {
      duplicates.push({ rowIndex: row.rowIndex })
    } else if (bestPartial) {
      conflicts.push({
        rowIndex: row.rowIndex,
        levelId,
        levelName: row.data.levelName ?? null,
        matchedId: bestPartial.existing.id,
        fields: bestPartial.fields,
      })
    }
  }
  return { conflicts, duplicates }
}

// One synchronous pre-commit pass over every tab's parsed rows. Progress/
// Dropped/Ratings/Collections/Ranking slices are wired in by later phases of
// the conflict-resolution rework — until then they always report empty.
export async function checkImportConflicts(
  userId: string,
  req: ImportCheckRequest
): Promise<ImportCheckResponse> {
  const completionRows = req.completions ?? []
  const levelIds = [
    ...new Set(
      completionRows.flatMap((r) => (r.data.levelId ? [r.data.levelId] : []))
    ),
  ]

  const existingRows = levelIds.length
    ? await prisma.levelProgress.findMany({
        where: {
          userId,
          levelId: { in: levelIds },
          progressUpdates: { some: { kind: 'COMPLETION' } },
        },
        include: {
          level: { select: { name: true, coins: true } },
          progressUpdates: {
            where: { kind: 'COMPLETION' },
            select: {
              date: true,
              dateUncertain: true,
              attempts: true,
              runFrom: true,
              runTo: true,
              fps: true,
              onStream: true,
              videoUrl: true,
              highlightUrl: true,
              notes: true,
              enjoyment: true,
              difficultyOpinion: true,
              twoPlayerSolo: true,
              twoPlayerPartner: true,
              device: true,
            },
            orderBy: { loggedAt: 'desc' },
            take: 1,
          },
        },
      })
    : []
  const existingByLevelId = new Map(existingRows.map((lp) => [lp.levelId, lp]))

  const completionConflicts: ImportRowConflict[] = []
  for (const row of completionRows) {
    if (!row.data.levelId) continue // name-only rows resolve too late to pre-check
    const lp = existingByLevelId.get(row.data.levelId)
    const pu = lp?.progressUpdates[0]
    if (!lp || !pu) continue

    const snapshot: ExistingCompletionSnapshot = {
      date: pu.date,
      dateUncertain: pu.dateUncertain,
      attempts: pu.attempts,
      runFrom: pu.runFrom,
      runTo: pu.runTo,
      fps: pu.fps,
      onStream: pu.onStream,
      videoUrl: pu.videoUrl,
      highlightUrl: pu.highlightUrl,
      notes: pu.notes,
      enjoyment: pu.enjoyment,
      simpleRating: lp.simpleRating,
      difficultyOpinion: pu.difficultyOpinion,
      coinsCollected: lp.coinsCollected,
      twoPlayerSolo: pu.twoPlayerSolo,
      twoPlayerPartner: pu.twoPlayerPartner,
      device: pu.device,
      worstFail: lp.worstFail,
      worstFailDate: lp.worstFailDate,
      visibility: lp.visibility,
      levelNotes: lp.levelNotes,
      userGddlTier: lp.userGddlTier,
    }
    const fields = diffCompletionFields(
      snapshot,
      row.data,
      (lp.level.coins ?? 0) > 0
    )
    if (fields.length === 0) continue

    completionConflicts.push({
      rowIndex: row.rowIndex,
      levelId: row.data.levelId,
      levelName: lp.level.name,
      matchedId: null,
      fields,
    })
  }

  // Progress/Dropped: pre-checked via the derived-key path whenever the row
  // won't have a working explicit round-trip at commit time — no
  // progress_id/drop_id at all, OR one that doesn't resolve to an existing
  // entry for THIS user and level (foreign — e.g. copied from a different
  // account's export — or stale). An id that genuinely resolves round-trips
  // unconditionally (unrelated, unchanged path) and is excluded here; a
  // name-only row resolves its level too late for this pass either way
  // (falls back to the commit-time dedup in planProgress/planDrop instead).
  // Mirrors planProgress/planDrop's own `matched` check exactly, so a row
  // never gets a "no conflict" pre-check result that then behaves
  // differently at commit time.
  const explicitProgressIds = [
    ...new Set(
      (req.progress ?? []).flatMap((r) =>
        r.data.progressId ? [r.data.progressId] : []
      )
    ),
  ]
  const explicitDropIds = [
    ...new Set(
      (req.dropped ?? []).flatMap((r) => (r.data.dropId ? [r.data.dropId] : []))
    ),
  ]
  const [resolvableProgressRows, resolvableDropRows] = await Promise.all([
    explicitProgressIds.length
      ? prisma.progressUpdate.findMany({
          where: { id: { in: explicitProgressIds }, levelProgress: { userId } },
          select: { id: true, levelProgress: { select: { levelId: true } } },
        })
      : Promise.resolve([]),
    explicitDropIds.length
      ? prisma.progressUpdate.findMany({
          where: {
            id: { in: explicitDropIds },
            kind: 'DROP',
            levelProgress: { userId },
          },
          select: { id: true, levelProgress: { select: { levelId: true } } },
        })
      : Promise.resolve([]),
  ])
  const resolvableProgress = new Map(
    resolvableProgressRows.map((r) => [r.id, r.levelProgress.levelId])
  )
  const resolvableDrops = new Map(
    resolvableDropRows.map((r) => [r.id, r.levelProgress.levelId])
  )

  const progressRows = (req.progress ?? []).filter(
    (r) =>
      r.data.levelId &&
      (!r.data.progressId ||
        resolvableProgress.get(r.data.progressId) !== r.data.levelId)
  )
  const droppedRows = (req.dropped ?? []).filter(
    (r) =>
      r.data.levelId &&
      (!r.data.dropId || resolvableDrops.get(r.data.dropId) !== r.data.levelId)
  )
  const progressLevelIds = [
    ...new Set(progressRows.map((r) => r.data.levelId!)),
  ]
  const droppedLevelIds = [...new Set(droppedRows.map((r) => r.data.levelId!))]

  const [progressEvents, dropEvents] = await Promise.all([
    fetchExistingEvents(userId, 'PROGRESS', progressLevelIds),
    fetchExistingEvents(userId, 'DROP', droppedLevelIds),
  ])
  const progressEventsByLevel = groupByLevel(progressEvents)
  const dropEventsByLevel = groupByLevel(dropEvents)

  const { conflicts: progressConflicts, duplicates: progressDuplicates } =
    scanForConflicts(progressRows, progressEventsByLevel, {
      keyOf: (row) =>
        deriveEventKey({
          date: row.data.date ?? null,
          percentage: row.data.percentage ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        }),
      diffOf: (existing, row) => diffProgressFields(existing, row.data),
    })

  const { conflicts: droppedConflicts, duplicates: droppedDuplicates } =
    scanForConflicts(droppedRows, dropEventsByLevel, {
      keyOf: (row) =>
        deriveEventKey({
          date: row.data.droppedAt ?? null,
          percentage: row.data.bestProgress ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        }),
      diffOf: (existing, row) => diffDroppedFields(existing, row.data),
    })

  const [ratingConflicts, collectionsMerge, rankingMerge] = await Promise.all([
    checkRatingConflicts(userId, req.ratings ?? []),
    checkCollectionsMerge(userId, req.collections ?? []),
    checkRankingMerge(userId, req.ranking ?? []),
  ])

  return {
    completionConflicts,
    progressConflicts,
    progressDuplicates,
    droppedConflicts,
    droppedDuplicates,
    ratingConflicts,
    collectionsMerge,
    rankingMerge,
  }
}
