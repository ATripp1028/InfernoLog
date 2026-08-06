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
import { searchRobtopByName, type RobtopLevel } from '../../../utils/robtop'

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
