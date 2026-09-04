// Ratings import — writes weighted per-category scores onto completed levels.
//
// Runs as one dedicated call after the completion batches. Each entry is one
// level's category scores (already on the internal 0-100 scale). Scores
// attach to the level's LevelProgress (one current set per level, not per
// event — see schema.prisma), so a listed level must be completed. Categories
// are matched by name and created on demand (weight 0 — never disturbs the
// account's 1.00 weight-sum invariant, and the rating mode is left
// untouched). Merge, not replace: only the categories named in the sheet are
// written; a level's other category scores are left alone.

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import {
  MAX_RATING_CATEGORIES,
  type ImportRatingEntry,
  type ImportRatingConflict,
} from '@infernolog/core'

/** Outcome of committing a spreadsheet's Ratings tab. */
export interface ImportRatingsResult {
  scored: number
  levels: number
  categoriesCreated: string[]
  skipped: { label: string; reason: string }[]
}

interface RatingTargets {
  lpByLevelId: Map<string, string>
  lpByName: Map<string, string[]>
  levelNameByLevelId: Map<string, string | null>
  catIdByName: Map<string, string>
  maxSortOrder: number
}

// Shared by commitImportRatings and checkRatingConflicts — the user's
// completed levels (as their LevelProgress id, since scores attach there)
// and their existing rating categories.
async function resolveRatingTargets(userId: string): Promise<RatingTargets> {
  // Independent reads on unrelated tables (levelProgress/level for completed
  // levels, ratingCategory for the user's categories) — nothing here depends
  // on the other's result, so fetch both concurrently.
  const [completed, cats] = await Promise.all([
    prisma.levelProgress.findMany({
      where: { userId, progressUpdates: { some: { kind: 'COMPLETION' } } },
      select: {
        id: true,
        levelId: true,
        level: { select: { name: true } },
      },
    }),
    prisma.ratingCategory.findMany({
      where: { userId },
      select: { id: true, name: true, sortOrder: true },
    }),
  ])
  const lpByLevelId = new Map<string, string>()
  const lpByName = new Map<string, string[]>()
  const levelNameByLevelId = new Map<string, string | null>()
  for (const c of completed) {
    lpByLevelId.set(c.levelId, c.id)
    levelNameByLevelId.set(c.levelId, c.level.name)
    const n = c.level.name?.trim().toLowerCase()
    if (!n) continue
    const list = lpByName.get(n)
    if (list) list.push(c.id)
    else lpByName.set(n, [c.id])
  }

  const catIdByName = new Map(
    cats.map((c) => [c.name.trim().toLowerCase(), c.id])
  )
  const maxSortOrder = cats.reduce((m, c) => Math.max(m, c.sortOrder), -1)

  return {
    lpByLevelId,
    lpByName,
    levelNameByLevelId,
    catIdByName,
    maxSortOrder,
  }
}

// Resolves one entry to its target LevelProgress, by levelId first then by a
// unique name match. Returns 'ambiguous' when the name matches more than one
// completed level, null when nothing matches at all.
function resolveRatingLpId(
  targets: RatingTargets,
  entry: ImportRatingEntry
): string | 'ambiguous' | null {
  let lpId = entry.levelId ? targets.lpByLevelId.get(entry.levelId) : undefined
  if (!lpId && entry.levelName) {
    const matches = targets.lpByName.get(entry.levelName.trim().toLowerCase())
    if (matches && matches.length === 1) lpId = matches[0]
    else if (matches && matches.length > 1) return 'ambiguous'
  }
  return lpId ?? null
}

/**
 * Writes the spreadsheet's Ratings tab onto the user's completions.
 *
 * Category columns in the sheet are matched to the user's existing rating
 * categories by name; unrecognized ones are created and reported in
 * `categoriesCreated`. Scores are stored as integers 0–100 regardless of the
 * user's display scale. Rows without a resolvable completion land in `skipped`
 * rather than failing the import.
 *
 * @param userId - Internal user UUID.
 * @param entries - Validated Ratings-tab rows.
 */
export async function commitImportRatings(
  userId: string,
  entries: ImportRatingEntry[]
): Promise<ImportRatingsResult> {
  const skipped: ImportRatingsResult['skipped'] = []
  const targets = await resolveRatingTargets(userId)
  const catIdByName = targets.catIdByName
  let maxSortOrder = targets.maxSortOrder

  // ── Resolve entries → (lpId, categoryName, score) triples ────────────
  interface Score {
    lpId: string
    categoryName: string
    score: number
  }
  const pending: Score[] = []
  const scoredLpIds = new Set<string>()
  // SIMPLE-mode scores, which live on level_progress rather than in
  // rating_scores. Collected alongside the category scores because the sheet
  // now carries both on one tab.
  const simpleRatings = new Map<string, number>()
  // Preserve first-seen order + original casing for any categories we create.
  const newCategoryNames = new Map<string, string>()
  // Categories already reported as over the cap. The cap is a property of the
  // COLUMN, not of any one row, so it is reported once — pushing a skip per
  // (row × over-cap column) would multiply one stray column into thousands of
  // identical entries, and this array is stored on the ImportJob row and
  // returned by every status poll.
  const overCapReported = new Set<string>()

  for (const entry of entries) {
    const label =
      entry.levelName ?? (entry.levelId ? `level ${entry.levelId}` : 'row')

    const lpId = resolveRatingLpId(targets, entry)
    if (lpId === 'ambiguous') {
      skipped.push({
        label,
        reason:
          'Matches more than one of your completed levels — add a level_id',
      })
      continue
    }
    if (!lpId) {
      skipped.push({
        label,
        reason:
          'Not among your completed levels — scores attach to completions',
      })
      continue
    }

    if (entry.simpleRating != null) {
      simpleRatings.set(lpId, entry.simpleRating)
      scoredLpIds.add(lpId)
    }

    for (const [rawName, score] of Object.entries(entry.scores)) {
      const name = rawName.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!catIdByName.has(key) && !newCategoryNames.has(key)) {
        // This is the only bulk path that creates rating categories, and the
        // sheet's column names are attacker-chosen. The settings editor caps an
        // account at MAX_RATING_CATEGORIES; honour the same ceiling here rather
        // than letting a crafted Ratings tab mint thousands of rows. Over the
        // cap the score is skipped, not the whole import — a sheet with a stray
        // extra column should still bring in everything else.
        if (catIdByName.size + newCategoryNames.size >= MAX_RATING_CATEGORIES) {
          if (!overCapReported.has(key)) {
            overCapReported.add(key)
            skipped.push({
              label: `Category “${name}”`,
              reason: `Skipped — an account can have at most ${MAX_RATING_CATEGORIES} rating categories`,
            })
          }
          continue
        }
        newCategoryNames.set(key, name)
      }
      pending.push({ lpId, categoryName: key, score })
      scoredLpIds.add(lpId)
    }
  }

  const result: ImportRatingsResult = {
    scored: 0,
    levels: 0,
    categoriesCreated: [],
    skipped,
  }
  if (pending.length === 0 && simpleRatings.size === 0) return result

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

    // Merge: clear only the exact (level, category) pairs we're writing,
    // then insert. Other category scores on those levels are untouched.
    const rows = pending.map((p) => ({
      id: randomUUID(),
      levelProgressId: p.lpId,
      categoryId: catIdByName.get(p.categoryName)!,
      score: p.score,
    }))
    await tx.ratingScore.deleteMany({
      where: {
        OR: rows.map((r) => ({
          levelProgressId: r.levelProgressId,
          categoryId: r.categoryId,
        })),
      },
    })
    await tx.ratingScore.createMany({ data: rows })

    // The simple score is one column on the same tab, written to the same
    // rows — one update each, since they carry different values.
    for (const [lpId, simpleRating] of simpleRatings) {
      await tx.levelProgress.update({
        where: { id: lpId },
        data: { simpleRating },
      })
    }

    result.scored = rows.length + simpleRatings.size
    result.levels = scoredLpIds.size
  })

  return result
}

/**
 * Pre-commit conflict check: an entry conflicts on a given category only when
 * a score already exists for that (completion, category) pair AND differs
 * from the incoming value. No existing score → not a conflict (plain
 * create). Existing-and-equal → not a conflict (silent no-op — the client
 * sends the same value again, which commitImportRatings just rewrites
 * harmlessly). Only entries with a known level_id are checked — a name-only
 * row resolves its level too late for this pre-commit pass, same convention
 * as Completions/Progress/Dropped.
 */
export async function checkRatingConflicts(
  userId: string,
  entries: ImportRatingEntry[]
): Promise<ImportRatingConflict[]> {
  const knownEntries = entries.filter((e) => e.levelId)
  if (knownEntries.length === 0) return []

  const targets = await resolveRatingTargets(userId)

  const resolved: {
    lpId: string
    levelId: string
    levelName: string | null
    scores: Record<string, number>
  }[] = []
  const lpIds = new Set<string>()
  for (const entry of knownEntries) {
    const lpId = resolveRatingLpId(targets, entry)
    if (!lpId || lpId === 'ambiguous') continue
    resolved.push({
      lpId,
      levelId: entry.levelId!,
      // The DB's canonical name, not the sheet's — more trustworthy for a
      // conflict review UI, and always available since lpId only resolves
      // against the user's own completed levels.
      levelName:
        targets.levelNameByLevelId.get(entry.levelId!) ??
        entry.levelName ??
        null,
      scores: entry.scores,
    })
    lpIds.add(lpId)
  }
  if (resolved.length === 0) return []

  const existingScores = await prisma.ratingScore.findMany({
    where: { levelProgressId: { in: [...lpIds] } },
    select: { levelProgressId: true, categoryId: true, score: true },
  })
  const existingByKey = new Map(
    existingScores.map((s) => [
      `${s.levelProgressId}::${s.categoryId}`,
      s.score,
    ])
  )

  const conflicts: ImportRatingConflict[] = []
  for (const entry of resolved) {
    for (const [rawName, importedScore] of Object.entries(entry.scores)) {
      const name = rawName.trim()
      if (!name) continue
      const categoryId = targets.catIdByName.get(name.toLowerCase())
      if (!categoryId) continue // new category — never a conflict
      const existingScore = existingByKey.get(`${entry.lpId}::${categoryId}`)
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
