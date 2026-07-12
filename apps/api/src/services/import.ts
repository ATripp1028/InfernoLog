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
import { DifficultyOpinion } from '@infernolog/core'
import type {
  ImportCompletionRow,
  ImportProgressRow,
  ImportDroppedRow,
  ImportCommitRow,
  ImportCommitResponse,
} from '@infernolog/core'
import { logger } from '../utils/logger'
import { searchRobtopByName, type RobtopLevel } from '../utils/robtop'
import { fetchGddlTier, roundGddlTier } from '../utils/gddl'
import { removeFromWantToBeat } from './collections'

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
  worstFail?: number
  worstFailDate?: Date | null
  droppedAt?: Date | null
  droppedReason?: string | null
  attemptsAtDrop?: number | null
  visibility?: 'PUBLIC' | 'PRIVATE'
  levelNotes?: string
  userGddlTier?: number | null
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
    { id: string; status: LpStatus; completionId: string | null }
  >
  levelDiff: Map<string, string | null>
  levelCoins: Map<string, number | null>
  // progress_id → the existing ProgressUpdate it round-trips to (and the level
  // it belongs to, so a mismatched/foreign id falls back to creating new).
  existingProgress: Map<string, { id: string; levelId: string }>
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

function planCompletion(
  ctx: PlanCtx,
  levelId: string,
  row: ImportCompletionRow,
  resolution: 'skip' | 'overwrite' | undefined,
  autoGddlTier: number | null
): 'committed' | 'updated' | 'skipped' {
  const existingCompletionId = ctx.dbState.get(levelId)?.completionId ?? null

  if (existingCompletionId && resolution !== 'overwrite') return 'skipped'

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

  if (existingCompletionId && resolution === 'overwrite') {
    // Merge, don't replace: only overwrite fields the spreadsheet actually
    // provides. Fields the sheet omits keep their InfernoLog values, and
    // InfernoLog-only data (category rating scores, list-reference sources the
    // sheet doesn't carry) is left untouched entirely.
    const puId = existingCompletionId
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
    if (row.simpleRating != null)
      merge.simpleRating = Math.round(row.simpleRating * 10)
    if (row.difficultyOpinion != null)
      merge.difficultyOpinion = row.difficultyOpinion
    if (row.difficultyOpinionStars != null)
      merge.difficultyOpinionStars = row.difficultyOpinionStars
    if (coinsCollected != null) merge.coinsCollected = coinsCollected
    if (row.twoPlayerSolo != null) merge.twoPlayerSolo = row.twoPlayerSolo
    if (row.twoPlayerPartner != null)
      merge.twoPlayerPartner = row.twoPlayerPartner
    if (row.device != null) merge.device = row.device
    if (Object.keys(merge).length > 0) {
      ctx.writes.progressUpdateUpdates.push({ id: puId, data: merge })
    }

    // LevelProgress-level fields: worstFail, per-entry privacy, the overall
    // level note, and user GDDL tier — each only when the sheet provides it.
    const lpMerge: LpFields = {
      ...(row.percentage != null
        ? { worstFail: Math.round(row.percentage) }
        : {}),
      ...(row.worstFailDate != null
        ? { worstFailDate: new Date(row.worstFailDate) }
        : {}),
      ...(row.visibility != null ? { visibility: row.visibility } : {}),
      ...(row.levelNotes != null ? { levelNotes: row.levelNotes } : {}),
      ...(userGddlTier != null ? { userGddlTier } : {}),
    }
    if (Object.keys(lpMerge).length > 0) applyLp(plan, lpMerge)
    return 'updated'
  }

  // New completion: write the full record, defaulting the booleans the sheet
  // may omit and snapshotting the level's current in-game difficulty.
  const puId = randomUUID()
  ctx.writes.newProgressUpdates.push({
    id: puId,
    levelProgressId: plan.id,
    isCompletion: true,
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
    simpleRating:
      row.simpleRating != null ? Math.round(row.simpleRating * 10) : null,
    difficultyOpinion: row.difficultyOpinion ?? null,
    difficultyOpinionStars: row.difficultyOpinionStars ?? null,
    coinsCollected,
    twoPlayerSolo: row.twoPlayerSolo ?? null,
    twoPlayerPartner: row.twoPlayerPartner ?? null,
    device: row.device ?? null,
    inGameDifficulty: ctx.levelDiff.get(levelId) ?? null,
  })
  applyLp(plan, {
    status: 'COMPLETED',
    ...(row.percentage != null
      ? { worstFail: Math.round(row.percentage) }
      : {}),
    ...(row.worstFailDate != null
      ? { worstFailDate: new Date(row.worstFailDate) }
      : {}),
    ...(row.visibility != null ? { visibility: row.visibility } : {}),
    ...(row.levelNotes != null ? { levelNotes: row.levelNotes } : {}),
    ...(userGddlTier != null ? { userGddlTier } : {}),
  })

  return 'committed'
}

function planDrop(
  ctx: PlanCtx,
  levelId: string,
  row: ImportDroppedRow
): 'committed' | 'updated' {
  // A drop against a LevelProgress that already existed modifies it; otherwise
  // it creates a new one.
  const existed = ctx.dbState.has(levelId)
  const plan = getLpPlan(ctx, levelId)
  applyLp(plan, {
    status: plan.completed ? 'COMPLETED' : 'DROPPED',
    droppedAt: row.droppedAt ? new Date(row.droppedAt) : null,
    droppedReason: row.reason ?? null,
    attemptsAtDrop: row.attemptsAtDrop ?? null,
    ...(row.bestProgress != null
      ? { worstFail: Math.round(row.bestProgress) }
      : {}),
  })
  return existed ? 'updated' : 'committed'
}

// A non-completion progress log. Unlike completions/drops, many rows can
// legitimately target the same level (session history) — so there is no
// "existing entry" to skip or overwrite by level. Round-trip identity instead
// comes from `progressId` (the ProgressUpdate.id, populated on export): a
// match (scoped to this exact level, to prevent cross-account/cross-level
// tampering) updates that entry in place; anything else creates a new one.
// Never touches LevelProgress.status — completions/drops establish status,
// and historical progress rows must not flip a dropped level back to
// in-progress on reimport.
function planProgress(
  ctx: PlanCtx,
  levelId: string,
  row: ImportProgressRow
): 'committed' | 'updated' {
  const matched = row.progressId ? ctx.existingProgress.get(row.progressId) : undefined
  const plan = getLpPlan(ctx, levelId)

  if (matched && matched.levelId === levelId) {
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
    return 'updated'
  }

  const puId = randomUUID()
  ctx.writes.newProgressUpdates.push({
    id: puId,
    levelProgressId: plan.id,
    isCompletion: false,
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
  return 'committed'
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
      progressUpdates: {
        where: { isCompletion: true },
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
      progressRows.flatMap((r) => (r.data.progressId ? [r.data.progressId] : []))
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

  // ── Plan all writes in memory (pure, no DB I/O) ───────────────────────
  const results: {
    rowIndex: number
    status: 'committed' | 'updated' | 'skipped' | 'failed'
    reason: string | null
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
  }

  // Levels whose completion was written/updated this batch — they leave the
  // user's Want to Beat collection in the same transaction.
  const completedLevelIds = new Set<string>()

  // A level can appear more than once per tab (flagged as a duplicate upstream).
  // Keep only the last completion / last drop per level so we never plan two
  // completions for one LevelProgress; earlier occurrences are recorded skipped.
  // Progress rows are exempt — multiple rows per level are legitimate session
  // history — except when two rows in this batch target the same progress_id,
  // where only the last one wins (same "later row supersedes" rule).
  const lastCompletion = new Map<string, number>()
  const lastDrop = new Map<string, number>()
  const lastProgressById = new Map<string, number>()
  for (const row of rows) {
    if (resolutionFailures.has(row.rowIndex)) continue
    const id = row.data.levelId ?? resolvedIds.get(row.rowIndex)
    if (row.type === 'progress') {
      if (row.data.progressId) lastProgressById.set(row.data.progressId, row.rowIndex)
      continue
    }
    if (!id) continue
    if (row.type === 'completion') lastCompletion.set(id, row.rowIndex)
    else lastDrop.set(id, row.rowIndex)
  }

  for (const row of rows) {
    // Resolution failure for name-only rows.
    const failureReason = resolutionFailures.get(row.rowIndex)
    if (failureReason) {
      results.push({
        rowIndex: row.rowIndex,
        status: 'failed',
        reason: failureReason,
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
            levelName: row.data.levelName ?? null,
            identifier: effectiveLevelId,
          })
          continue
        }
      }
    } else {
      const lastForLevel =
        row.type === 'completion'
          ? lastCompletion.get(effectiveLevelId)
          : lastDrop.get(effectiveLevelId)
      if (lastForLevel !== row.rowIndex) {
        const reason =
          'Superseded by a later row for the same level in this import'
        results.push({
          rowIndex: row.rowIndex,
          status: 'skipped',
          reason,
          levelName: row.data.levelName ?? null,
          identifier: effectiveLevelId,
        })
        continue
      }
    }

    let outcomeStatus: 'committed' | 'updated' | 'skipped' | 'failed'
    let reason: string | undefined
    try {
      if (row.type === 'completion') {
        const autoGddlTier = !row.data.userGddlTier
          ? (gddlTierCache.get(effectiveLevelId) ?? null)
          : null
        outcomeStatus = planCompletion(
          ctx,
          effectiveLevelId,
          row.data,
          row.conflictResolution,
          autoGddlTier
        )
        if (outcomeStatus === 'committed' || outcomeStatus === 'updated') {
          completedLevelIds.add(effectiveLevelId)
        }
      } else if (row.type === 'dropped') {
        outcomeStatus = planDrop(ctx, effectiveLevelId, row.data)
      } else {
        outcomeStatus = planProgress(ctx, effectiveLevelId, row.data)
      }
    } catch (err) {
      outcomeStatus = 'failed'
      reason = err instanceof Error ? err.message : 'Unknown error'
      logger.warn(
        { importJobId, rowIndex: row.rowIndex, levelId: effectiveLevelId, err },
        'importBatch: row failed'
      )
    }

    // Explain the one non-superseded skip case (superseded rows set their own
    // reason above): an existing completion the user chose not to overwrite.
    if (outcomeStatus! === 'skipped' && !reason) {
      reason = 'Existing completion kept — choose Overwrite to replace it'
    }

    results.push({
      rowIndex: row.rowIndex,
      status: outcomeStatus!,
      reason: reason ?? null,
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
      // as "pending" by POST /v1/me/import/start. issueMessage is only set for
      // skipped/failed rows: that's the "flagged" set the review UI surfaces.
      for (const r of results) {
        const id = rowDbId.get(r.rowIndex)
        if (!id) continue
        await tx.importJobRow.update({
          where: { id },
          data: {
            status: r.status,
            issueMessage:
              r.status === 'skipped' || r.status === 'failed' ? r.reason : null,
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
    data: { id: importJobId, userId, status: 'running', totalRows: rows.length },
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

export async function checkImportConflicts(
  userId: string,
  levelIds: string[]
): Promise<{
  conflicts: Array<{
    levelId: string
    levelName: string | null
    date: string | null
    attempts: number | null
    enjoyment: number | null
    simpleRating: number | null
    difficultyOpinion: DifficultyOpinion | null
  }>
}> {
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
