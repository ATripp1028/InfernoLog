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
import type { ImportRatingEntry } from '@infernolog/core'

export interface ImportRatingsResult {
  scored: number
  levels: number
  categoriesCreated: string[]
  skipped: { label: string; reason: string }[]
}

export async function commitImportRatings(
  userId: string,
  entries: ImportRatingEntry[]
): Promise<ImportRatingsResult> {
  const skipped: ImportRatingsResult['skipped'] = []

  // Scores attach to completions — resolve each entry against the user's own
  // completed levels (the completion's ProgressUpdate id).
  const completed = await prisma.levelProgress.findMany({
    where: { userId, progressUpdates: { some: { kind: 'COMPLETION' } } },
    select: {
      levelId: true,
      level: { select: { name: true } },
      progressUpdates: { where: { kind: 'COMPLETION' }, select: { id: true }, take: 1 },
    },
  })
  const puByLevelId = new Map<string, string>()
  const puByName = new Map<string, string[]>()
  for (const c of completed) {
    const puId = c.progressUpdates[0]?.id
    if (!puId) continue
    puByLevelId.set(c.levelId, puId)
    const n = c.level.name?.trim().toLowerCase()
    if (!n) continue
    const list = puByName.get(n)
    if (list) list.push(puId)
    else puByName.set(n, [puId])
  }

  // Existing categories, matched case-insensitively by name.
  const cats = await prisma.ratingCategory.findMany({
    where: { userId },
    select: { id: true, name: true, sortOrder: true },
  })
  const catIdByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]))
  let maxSortOrder = cats.reduce((m, c) => Math.max(m, c.sortOrder), -1)

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
    const label = entry.levelName ?? (entry.levelId ? `level ${entry.levelId}` : 'row')

    let puId = entry.levelId ? puByLevelId.get(entry.levelId) : undefined
    if (!puId && entry.levelName) {
      const matches = puByName.get(entry.levelName.trim().toLowerCase())
      if (matches && matches.length === 1) puId = matches[0]
      else if (matches && matches.length > 1) {
        skipped.push({ label, reason: 'Matches more than one of your completed levels — add a level_id' })
        continue
      }
    }
    if (!puId) {
      skipped.push({ label, reason: 'Not among your completed levels — scores attach to completions' })
      continue
    }

    for (const [rawName, score] of Object.entries(entry.scores)) {
      const name = rawName.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!catIdByName.has(key) && !newCategoryNames.has(key)) newCategoryNames.set(key, name)
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
        OR: rows.map((r) => ({ progressUpdateId: r.progressUpdateId, categoryId: r.categoryId })),
      },
    })
    await tx.ratingScore.createMany({ data: rows })

    result.scored = rows.length
    result.levels = scoredPuIds.size
  })

  return result
}
