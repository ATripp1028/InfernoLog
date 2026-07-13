// Ranking import — replaces the user's classic ranking with an ordered list.
//
// Ranking is a total order with replace semantics: when the spreadsheet carries
// a ranking tab, that order becomes the user's ranking (the "sheet wins" rule).
// This runs as one dedicated call after the completion/drop batches commit, so
// every ranked level already exists as one of the user's completions.
//
// Ordering: ClassicRanking.rankingIndex is higher = harder (the UI shows it
// DESC, #1 = hardest). The incoming entries are ordered hardest → easiest, so
// entry 0 gets the highest index. We assign plain integers 1..N — the same shape
// the rebalance job produces — since a full replace has no neighbours to bisect.

import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import type { ImportRankingEntry } from '@infernolog/core'

export interface ImportRankingResult {
  placed: number
  skipped: { rank: number; label: string; reason: string }[]
}

export async function commitImportRanking(
  userId: string,
  entries: ImportRankingEntry[]
): Promise<ImportRankingResult> {
  const skipped: ImportRankingResult['skipped'] = []

  // Ranking only applies to completed levels, so resolve every entry against the
  // user's own completions rather than the GD servers.
  const completed = await prisma.levelProgress.findMany({
    where: { userId, progressUpdates: { some: { kind: 'COMPLETION' } } },
    select: { id: true, levelId: true, level: { select: { name: true } } },
  })

  const byLevelId = new Map(completed.map((c) => [c.levelId, c.id]))
  const byName = new Map<string, string[]>()
  for (const c of completed) {
    const n = c.level.name?.trim().toLowerCase()
    if (!n) continue
    const list = byName.get(n)
    if (list) list.push(c.id)
    else byName.set(n, [c.id])
  }

  const orderedLpIds: string[] = [] // hardest → easiest
  const seen = new Set<string>()

  entries.forEach((entry, i) => {
    const rank = i + 1
    const label =
      entry.levelName ??
      (entry.levelId ? `level ${entry.levelId}` : `rank ${rank}`)

    let lpId = entry.levelId ? byLevelId.get(entry.levelId) : undefined
    if (!lpId && entry.levelName) {
      const matches = byName.get(entry.levelName.trim().toLowerCase())
      if (matches && matches.length === 1) lpId = matches[0]
      else if (matches && matches.length > 1) {
        skipped.push({
          rank,
          label,
          reason:
            'Matches more than one of your completed levels — add a level_id',
        })
        return
      }
    }
    if (!lpId) {
      skipped.push({
        rank,
        label,
        reason:
          'Not among your completed levels — rank only applies to completions',
      })
      return
    }
    if (seen.has(lpId)) {
      skipped.push({
        rank,
        label,
        reason: 'Duplicate — this level is already ranked higher up',
      })
      return
    }
    seen.add(lpId)
    orderedLpIds.push(lpId)
  })

  const n = orderedLpIds.length

  // Only replace when at least one entry resolved — otherwise a ranking tab full
  // of unresolvable rows would silently wipe an existing ranking.
  if (n > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.classicRanking.deleteMany({ where: { userId } })
      await tx.classicRanking.createMany({
        data: orderedLpIds.map((levelProgressId, i) => ({
          userId,
          levelProgressId,
          // Hardest (i = 0) gets the highest index; easiest gets 1.
          rankingIndex: new Prisma.Decimal(n - i),
        })),
      })
    })
  }

  return { placed: n, skipped }
}
