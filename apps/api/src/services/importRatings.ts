// Ratings import — writes weighted per-category scores onto completions.
//
// Runs as one dedicated call after the completion batches. Each entry is one
// level's category scores (already on the internal 0-100 scale). Scores attach
// to the level's completion, so a listed level must be completed. Categories are
// matched by name and created on demand (weight 0 — never disturbs the account's
// 1.00 weight-sum invariant, and the rating mode is left untouched). Merge, not
// replace: only the categories named in the sheet are written; a completion's
// other category scores are left alone.

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import type { ImportRatingEntry, ImportRatingConflict } from '@infernolog/core'

export interface ImportRatingsResult {
  scored: number
  levels: number
  categoriesCreated: string[]
  skipped: { label: string; reason: string }[]
}

interface RatingTargets {
  puByLevelId: Map<string, string>
  puByName: Map<string, string[]>
  levelNameByLevelId: Map<string, string | null>
  catIdByName: Map<string, string>
  maxSortOrder: number
}

// Shared by commitImportRatings and checkRatingConflicts — the user's
// completed levels (as their completion's ProgressUpdate id, since scores
// attach there) and their existing rating categories.
async function resolveRatingTargets(userId: string): Promise<RatingTargets> {
  const completed = await prisma.levelProgress.findMany({
    where: { userId, progressUpdates: { some: { kind: 'COMPLETION' } } },
    select: {
      levelId: true,
      level: { select: { name: true } },
      progressUpdates: {
        where: { kind: 'COMPLETION' },
        select: { id: true },
        take: 1,
      },
    },
  })
  const puByLevelId = new Map<string, string>()
  const puByName = new Map<string, string[]>()
  const levelNameByLevelId = new Map<string, string | null>()
  for (const c of completed) {
    const puId = c.progressUpdates[0]?.id
    if (!puId) continue
    puByLevelId.set(c.levelId, puId)
    levelNameByLevelId.set(c.levelId, c.level.name)
    const n = c.level.name?.trim().toLowerCase()
    if (!n) continue
    const list = puByName.get(n)
    if (list) list.push(puId)
    else puByName.set(n, [puId])
  }

  const cats = await prisma.ratingCategory.findMany({
    where: { userId },
    select: { id: true, name: true, sortOrder: true },
  })
  const catIdByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const maxSortOrder = cats.reduce((m, c) => Math.max(m, c.sortOrder), -1)

  return { puByLevelId, puByName, levelNameByLevelId, catIdByName, maxSortOrder }
}

// Resolves one entry to its target completion, by levelId first then by a
// unique name match. Returns 'ambiguous' when the name matches more than one
// completed level, null when nothing matches at all.
function resolveRatingPuId(
  targets: RatingTargets,
  entry: ImportRatingEntry
): string | 'ambiguous' | null {
  let puId = entry.levelId ? targets.puByLevelId.get(entry.levelId) : undefined
  if (!puId && entry.levelName) {
    const matches = targets.puByName.get(entry.levelName.trim().toLowerCase())
    if (matches && matches.length === 1) puId = matches[0]
    else if (matches && matches.length > 1) return 'ambiguous'
  }
  return puId ?? null
}

export async function commitImportRatings(
  userId: string,
  entries: ImportRatingEntry[]
): Promise<ImportRatingsResult> {
  const skipped: ImportRatingsResult['skipped'] = []
  const targets = await resolveRatingTargets(userId)
  const catIdByName = targets.catIdByName
  let maxSortOrder = targets.maxSortOrder

  // ── Resolve entries → (puId, categoryName, score) triples ────────────
  interface Score {
    puId: string
    categoryName: string
    score: number
  }
  const pending: Score[] = []
  const scoredPuIds = new Set<string>()
  // Preserve first-seen order + original casing for any categories we create.
  const newCategoryNames = new Map<string, string>()

  for (const entry of entries) {
    const label =
      entry.levelName ?? (entry.levelId ? `level ${entry.levelId}` : 'row')

    const puId = resolveRatingPuId(targets, entry)
    if (puId === 'ambiguous') {
      skipped.push({
        label,
        reason: 'Matches more than one of your completed levels — add a level_id',
      })
      continue
    }
    if (!puId) {
      skipped.push({
        label,
        reason: 'Not among your completed levels — scores attach to completions',
      })
      continue
    }

    for (const [rawName, score] of Object.entries(entry.scores)) {
      const name = rawName.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!catIdByName.has(key) && !newCategoryNames.has(key))
        newCategoryNames.set(key, name)
      pending.push({ puId, categoryName: key, score })
      scoredPuIds.add(puId)
    }
  }

  const result: ImportRatingsResult = {
    scored: 0,
    levels: 0,
    categoriesCreated: [],
    skipped,
  }
  if (pending.length === 0) return result

  await prisma.$transaction(async (tx) => {
    // Create any missing categories (weight 0, appended in sheet order).
    if (newCategoryNames.size > 0) {
      const data = [...newCategoryNames.entries()].map(([key, displayName]) => {
        const id = randomUUID()
        catIdByName.set(key, id)
        result.categoriesCreated.push(displayName)
        return {
          id,
          userId,
          name: displayName,
          weight: new Prisma.Decimal(0),
          sortOrder: ++maxSortOrder,
        }
      })
      await tx.ratingCategory.createMany({ data })
    }

    // Merge: clear only the exact (completion, category) pairs we're writing,
    // then insert. Other category scores on those completions are untouched.
    const rows = pending.map((p) => ({
      id: randomUUID(),
      progressUpdateId: p.puId,
      categoryId: catIdByName.get(p.categoryName)!,
      score: p.score,
    }))
    await tx.ratingScore.deleteMany({
      where: {
        OR: rows.map((r) => ({
          progressUpdateId: r.progressUpdateId,
          categoryId: r.categoryId,
        })),
      },
    })
    await tx.ratingScore.createMany({ data: rows })

    result.scored = rows.length
    result.levels = scoredPuIds.size
  })

  return result
}

// Pre-commit conflict check: an entry conflicts on a given category only when
// a score already exists for that (completion, category) pair AND differs
// from the incoming value. No existing score → not a conflict (plain
// create). Existing-and-equal → not a conflict (silent no-op — the client
// sends the same value again, which commitImportRatings just rewrites
// harmlessly). Only entries with a known level_id are checked — a name-only
// row resolves its level too late for this pre-commit pass, same convention
// as Completions/Progress/Dropped.
export async function checkRatingConflicts(
  userId: string,
  entries: ImportRatingEntry[]
): Promise<ImportRatingConflict[]> {
  const knownEntries = entries.filter((e) => e.levelId)
  if (knownEntries.length === 0) return []

  const targets = await resolveRatingTargets(userId)

  const resolved: {
    puId: string
    levelId: string
    levelName: string | null
    scores: Record<string, number>
  }[] = []
  const puIds = new Set<string>()
  for (const entry of knownEntries) {
    const puId = resolveRatingPuId(targets, entry)
    if (!puId || puId === 'ambiguous') continue
    resolved.push({
      puId,
      levelId: entry.levelId!,
      // The DB's canonical name, not the sheet's — more trustworthy for a
      // conflict review UI, and always available since puId only resolves
      // against the user's own completed levels.
      levelName:
        targets.levelNameByLevelId.get(entry.levelId!) ??
        entry.levelName ??
        null,
      scores: entry.scores,
    })
    puIds.add(puId)
  }
  if (resolved.length === 0) return []

  const existingScores = await prisma.ratingScore.findMany({
    where: { progressUpdateId: { in: [...puIds] } },
    select: { progressUpdateId: true, categoryId: true, score: true },
  })
  const existingByKey = new Map(
    existingScores.map((s) => [`${s.progressUpdateId}::${s.categoryId}`, s.score])
  )

  const conflicts: ImportRatingConflict[] = []
  for (const entry of resolved) {
    for (const [rawName, importedScore] of Object.entries(entry.scores)) {
      const name = rawName.trim()
      if (!name) continue
      const categoryId = targets.catIdByName.get(name.toLowerCase())
      if (!categoryId) continue // new category — never a conflict
      const existingScore = existingByKey.get(`${entry.puId}::${categoryId}`)
      if (existingScore == null || existingScore === importedScore) continue
      conflicts.push({
        levelId: entry.levelId,
        levelName: entry.levelName,
        categoryName: name,
        existingScore,
        importedScore,
      })
    }
  }
  return conflicts
}
