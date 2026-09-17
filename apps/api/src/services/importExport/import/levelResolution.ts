// Resolving spreadsheet rows to cached levels: name-based lookup against the
// cache then RobTop, stub creation for rows we can't resolve, and the SQS
// enqueue that asks the seed worker to fill those stubs in later.

// Spreadsheet import service — commit logic for POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop
// writes, cross-tab reconciliation (completion + drop for same level),
// conflict resolution, idempotency via (importJobId, rowIndex) keys,
// name-based level resolution, and GDDL tier autofill.

import prisma from '../../../utils/prisma'
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs'
import type { Prisma } from '@prisma/client'
import {
  fetchRobtopLevelResult,
  searchRobtopByName,
  type RobtopLevel,
} from '../../../utils/robtop'
import { isAdmissible } from '../../levels/admission'

type Tx = Prisma.TransactionClient

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

// ── Name-based level resolution ────────────────────────────────────────────

// Demon tier names, keyed without the redundant "Demon" suffix. A bare tier name
// in a sheet means the DEMON tier — "Easy" is Easy Demon — which is now the only
// reading there is: a rated non-demon is never cached (see
// services/levels/admission.ts), so no sheet value can name one. Levels in our
// DB store the suffixed form for demons (see deriveDifficulty in robtop.ts), so
// both sides normalize through this.
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

/** A candidate's difficulty, from either the DB or a RobTop search hit. */
interface DifficultyFacts {
  inGameDifficulty: string | null
}

// Builds a hard difficulty predicate from the spreadsheet's in_game_difficulty.
// Returns null when the value names no demon tier, in which case difficulty
// simply isn't used to filter — including for the non-demon faces a sheet
// written before demons-only may still carry, which now match nothing and so
// must not be allowed to rule every candidate out.
//
// A candidate with no difficulty at all — an un-enriched stub, a hand-added row
// — gets the benefit of the doubt, as an unknown-difficulty candidate always
// has.
function difficultyPredicate(
  inGameDifficulty: string | null | undefined
): ((level: DifficultyFacts) => boolean) | null {
  const tier = normalizeTier(inGameDifficulty)
  if (!tier || !DEMON_TIER_FILTERS[tier]) return null
  return (level) => {
    if (level.inGameDifficulty == null) return true
    const d = level.inGameDifficulty.toLowerCase()
    return d.includes('demon') && normalizeTier(d) === tier
  }
}

// Maps a spreadsheet in_game_difficulty to GD search API diff/demonFilter params.
//
// `diff=-2` is GD's Demon bucket and is sent for every name search, difficulty
// column or not: the cache admits no rated non-demon, so searching the rest of
// GD's library only turns up levels that would be refused. The consequence is
// that an UNRATED level whose vote-derived face isn't a demon one cannot be
// resolved by name — such a row needs a level_id (see docs/IMPORT_EXPORT.md).
function toDiffFilter(diff: string | null | undefined): {
  diff: string
  demonFilter?: string
} {
  const tier = normalizeTier(diff)
  const demonFilter = tier ? DEMON_TIER_FILTERS[tier] : undefined
  return demonFilter ? { diff: '-2', demonFilter } : { diff: '-2' }
}

/**
 * Resolves a level ID from its name, checking InfernoLog's cache first then
 * falling back to a live RobTop name search. Returns:
 *   { levelId, robtopLevel? } — unique match (robtopLevel present when found via RobTop)
 *   'ambiguous'               — multiple candidates even after creator/difficulty filtering
 *   null                      — no match found anywhere
 */
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
  const matchesDifficulty = difficultyPredicate(inGameDifficulty)
  let candidates = dbLevels
  // Difficulty is a hard filter (applied even when it empties the list, so the
  // wrong-difficulty single match falls through to RobTop instead of resolving).
  if (matchesDifficulty) candidates = candidates.filter(matchesDifficulty)
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
  const matchesDifficulty = difficultyPredicate(inGameDifficulty)
  const rtResults = await searchRobtopByName(
    name,
    toDiffFilter(inGameDifficulty)
  )
  // Compare trimmed: RobTop stores some names with trailing/leading whitespace.
  const wantName = name.trim().toLowerCase()
  // isAdmissible is a backstop: toDiffFilter already restricts the search to
  // GD's Demon bucket, but nothing is resolved (and then cached) on that alone.
  let rtCandidates = rtResults.filter(
    (r) =>
      r.level.name?.trim().toLowerCase() === wantName && isAdmissible(r.level)
  )
  if (matchesDifficulty) {
    rtCandidates = rtCandidates.filter((r) => matchesDifficulty(r.level))
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

/**
 * Resolves a level from its spreadsheet name (plus optional creator and
 * difficulty), checking the local cache before falling back to RobTop.
 *
 * @param name - Level name as written in the sheet.
 * @param creator - Optional creator, used to disambiguate same-named levels.
 * @param inGameDifficulty - Optional difficulty, used the same way.
 * @returns The resolved level id (with RobTop data when the fallback fired),
 * `'ambiguous'` when several candidates match equally well — the row is flagged
 * for the user to disambiguate — or null when nothing matched.
 */
export async function resolveByName(
  name: string,
  creator?: string | null,
  inGameDifficulty?: string | null
): Promise<ResolveResult> {
  // 1. Check the local cache first, then fall back to RobTop.
  const dbLevels = await prisma.level.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: {
      inGameId: true,
      creator: true,
      inGameDifficulty: true,
    },
  })
  const db = resolveFromDbCandidates(dbLevels, creator, inGameDifficulty)
  if (db) return db // unique match or 'ambiguous'
  return resolveViaRobtop(name, creator, inGameDifficulty)
}

/**
 * Bulk name resolution: fetches all DB candidates in a few queries (grouped by
 * lowercased name) rather than one query per name, then falls back to RobTop
 * only for the DB misses. Keeps the DB-first ordering for a large one-shot
 * import (e.g. a Lists tab with thousands of name-only rows). Returns results
 * positionally aligned with `inputs`.
 */
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

// ── Admission screening ────────────────────────────────────────────────────

/** What {@link screenUncachedIds} learned about the ids it was given. */
export interface ScreeningResult {
  /** Ids GD reports as rated non-demons. Nothing may be written for these. */
  refused: Set<string>
  /** GD's snapshot for the ids that passed, so callers need not re-fetch. */
  resolved: Map<string, RobtopLevel>
}

/**
 * Asks GD about level ids this cache has never seen, so a rated non-demon is
 * refused BEFORE the import writes anything that references it.
 *
 * A row naming a level by id otherwise goes straight to a placeholder row, with
 * GD consulted later by the seed worker — too late, since the row's progress
 * would already reference the level.
 *
 * Each lookup is paced by the shared RobTop limiter, so the pass is budgeted.
 * Ids the budget cuts off, and ids GD can't answer for, come back in neither
 * set: the caller falls back to the placeholder + seed-queue path, which is the
 * one documented way a non-demon can still end up cached.
 *
 * @param levelIds - Ids named by the batch; already-cached ones are skipped.
 * @param budgetMs - Wall-clock ceiling on the whole pass.
 */
export async function screenUncachedIds(
  levelIds: string[],
  budgetMs: number
): Promise<ScreeningResult> {
  const refused = new Set<string>()
  const resolved = new Map<string, RobtopLevel>()
  if (!levelIds.length) return { refused, resolved }

  const cached = await prisma.level.findMany({
    where: { inGameId: { in: levelIds } },
    select: { inGameId: true },
  })
  const cachedIds = new Set(cached.map((l) => l.inGameId))
  const deadline = Date.now() + budgetMs

  for (const id of levelIds) {
    if (cachedIds.has(id)) continue
    if (Date.now() >= deadline) break
    const res = await fetchRobtopLevelResult(id)
    if (res.status !== 'found') continue
    if (isAdmissible(res.level)) resolved.set(id, res.level)
    else refused.add(id)
  }

  return { refused, resolved }
}

// ── Stub level creation ────────────────────────────────────────────────────

/**
 * Creates placeholder `levels` rows for ids not yet cached, so import writes
 * have something to FK against.
 *
 * Stubs are marked `data_source=manual` / `verified=false`; the seed worker
 * later upgrades them to full RobTop snapshots (see
 * {@link buildRobtopRefreshData}).
 *
 * @param tx - The caller's transaction client.
 * @param levelIds - Ids to ensure exist; already-present ones are left alone.
 * @returns Only the ids actually created, which is what the caller enqueues
 * for seeding.
 */
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

/**
 * Queues freshly-created stub levels for async RobTop enrichment.
 *
 * Sends to the level-seed SQS queue in small batches. A no-op when
 * `LEVEL_SEED_QUEUE_URL` is unset — the stubs simply stay unenriched until the
 * next volatile sync, which is degraded but not broken.
 *
 * @param levelIds - Stub level ids to enrich.
 */
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
