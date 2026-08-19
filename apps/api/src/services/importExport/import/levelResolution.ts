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
  MAX_NON_DEMON_STARS,
  faceMatchesStars,
  starsToFace,
} from '@infernolog/core'
import { searchRobtopByName, type RobtopLevel } from '../../../utils/robtop'
import { OFFICIAL_LEVELS_BY_ID } from '../../../data/officialLevels'

type Tx = Prisma.TransactionClient

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

// ── Name-based level resolution ────────────────────────────────────────────


// Demon tier names, keyed without the redundant "Demon" suffix. A bare tier name
// in a sheet means the DEMON tier — "Easy" is Easy Demon, not the 2-star Easy.
// That convention predates non-demon support and is what the import template
// documents ('e.g. "Easy" (Demon is implied)'), so it stays; a sheet that means
// the non-demon difficulty says so unambiguously with a star count (see
// starsFromSheetValue). Levels in our DB store the suffixed form for demons
// (see deriveDifficulty in robtop.ts), so both sides normalize through this.
const DEMON_TIER_FILTERS: Record<string, string> = {
  easy: '1',
  medium: '2',
  hard: '3',
  insane: '4',
  extreme: '5',
}

// GD search's `diff` parameter by difficulty face. These are NOT star counts —
// GD numbers its difficulty buckets separately (Auto is -3), and a bucket covers
// a whole band (both 4- and 5-star levels are `diff=3`). Keyed by face rather
// than count for exactly that reason. Mirrors NONDEMON_DIFF in
// services/levels/gdSearch.ts.
const FACE_TO_GD_DIFF: Record<string, string> = {
  auto: '-3',
  easy: '1',
  normal: '2',
  hard: '3',
  harder: '4',
  insane: '5',
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

// What a sheet's in_game_difficulty is claiming about a non-demon, or null when
// it isn't claiming anything this scale covers.
//
// Two shapes, because they carry different amounts of information:
//   * an exact star count — "5", "5★", "5 stars" — which pins the difficulty;
//   * a bare face name that CANNOT also be a demon tier ("Auto", "Normal",
//     "Harder"), which pins only a band (Harder is 6 or 7 stars).
//
// "Easy" / "Hard" / "Insane" are deliberately excluded from the face branch:
// they read as demon tiers per the convention above, and a sheet meaning the
// non-demon one writes the number.
type NonDemonClaim =
  | { kind: 'stars'; stars: number }
  | { kind: 'face'; face: string }

function nonDemonClaimFromSheetValue(
  value: string | null | undefined
): NonDemonClaim | null {
  if (!value) return null
  const v = value.trim().toLowerCase()

  const numeric = v.match(/^(\d+)\s*(?:★|\*|stars?)?$/)
  if (numeric) {
    const n = Number(numeric[1])
    return n >= 1 && n <= MAX_NON_DEMON_STARS ? { kind: 'stars', stars: n } : null
  }

  if (v === 'auto' || v === 'normal' || v === 'harder') {
    return { kind: 'face', face: v }
  }
  return null
}

/** A candidate's difficulty, from either the DB or a RobTop search hit. */
interface DifficultyFacts {
  inGameDifficulty: string | null
  stars: number | null
  // DB candidates only — a RobTop hit has no id here, and RobTop never serves
  // an official level anyway, so its absence is always the right answer.
  inGameId?: string
}

// RobTop's own main levels carry bespoke star awards that ignore the difficulty
// bands — Dry Out is 4 stars but Normal, Time Machine 8 but Harder — so for
// those rows the count and the label are BOTH true and routinely disagree.
// Neither may veto the other, or a sheet naming an official level by its real
// face stops resolving. Same exemption services/levels/difficulty.ts applies on
// the read side.
function isOfficial(level: DifficultyFacts): boolean {
  return level.inGameId != null && OFFICIAL_LEVELS_BY_ID.has(level.inGameId)
}

// Builds a hard difficulty predicate from the spreadsheet's in_game_difficulty.
// Returns null when the value claims nothing recognizable, in which case
// difficulty simply isn't used to filter.
//
// Each claim is matched against whichever field the candidate actually has,
// preferring `stars` since that is the canonical identifier for a non-demon
// (see starDifficulty.ts). A candidate carrying only a label is still testable —
// un-enriched stubs and hand-added rows can have one without the other — because
// a label pins a BAND, so it can rule a count in or out even though it could
// never produce one. Only a candidate with neither field gets the benefit of the
// doubt, the way an unknown-difficulty candidate always has.
function difficultyPredicate(
  inGameDifficulty: string | null | undefined
): ((level: DifficultyFacts) => boolean) | null {
  const claim = nonDemonClaimFromSheetValue(inGameDifficulty)

  // An exact count: the candidate must be that count, or carry a label whose
  // band contains it.
  if (claim?.kind === 'stars') {
    return (level) => {
      const byLabel =
        level.inGameDifficulty != null &&
        faceMatchesStars(level.inGameDifficulty, claim.stars)
      if (isOfficial(level)) return level.stars === claim.stars || byLabel
      if (level.stars != null) return level.stars === claim.stars
      if (level.inGameDifficulty == null) return true
      return byLabel
    }
  }

  // A face: the candidate's count must fall in that face's band, or its label
  // must name the same face. Cannot narrow within the band — the sheet didn't.
  if (claim?.kind === 'face') {
    return (level) => {
      const byLabel =
        level.inGameDifficulty?.trim().toLowerCase() === claim.face
      if (isOfficial(level))
        return (
          byLabel ||
          (level.stars != null && faceMatchesStars(claim.face, level.stars))
        )
      if (level.stars != null) return faceMatchesStars(claim.face, level.stars)
      if (level.inGameDifficulty == null) return true
      return byLabel
    }
  }

  const tier = normalizeTier(inGameDifficulty)
  if (!tier || !DEMON_TIER_FILTERS[tier]) return null
  return (level) => {
    if (level.inGameDifficulty == null) return true
    const d = level.inGameDifficulty.toLowerCase()
    return d.includes('demon') && normalizeTier(d) === tier
  }
}

// Maps a spreadsheet in_game_difficulty to GD search API diff/demonFilter params.
function toDiffFilter(diff: string | null | undefined): {
  diff?: string
  demonFilter?: string
} {
  // Both claim shapes resolve to a face, since GD's diff buckets are per-face:
  // asking for 4 stars and asking for 5 stars are the same query (`diff=3`).
  const claim = nonDemonClaimFromSheetValue(diff)
  if (claim) {
    const face =
      claim.kind === 'face' ? claim.face : starsToFace(claim.stars)?.toLowerCase()
    const bucket = face ? FACE_TO_GD_DIFF[face] : undefined
    if (bucket) return { diff: bucket }
    return {}
  }

  const tier = normalizeTier(diff)
  if (!tier) return {}
  const demonFilter = DEMON_TIER_FILTERS[tier]
  if (!demonFilter) return {}
  return { diff: '-2', demonFilter }
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
  // The canonical difficulty identifier for a non-demon.
  stars: number | null
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
  let rtCandidates = rtResults.filter(
    (r) => r.level.name?.trim().toLowerCase() === wantName
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
      stars: true,
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
        stars: true,
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
