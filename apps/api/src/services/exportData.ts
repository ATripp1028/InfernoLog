// Account export — gathers everything the import format can carry, in a faithful
// domain form. The client formats it into the import-compatible spreadsheet
// (date formatting, 0-100 → 0-10 rating scale, coin bitmask → columns).
//
// Fetched one section at a time with offset pagination so no single response
// can exceed API Gateway's response cap for a large account. Offset pagination
// is safe here: an export is a read-only snapshot of a single user's own data,
// which isn't being mutated concurrently mid-export.
//
// What it intentionally does NOT include (out of the import model / user-only):
// rating category weights + mode, progress history beyond the completion,
// AREDL references, and system timestamps. See docs/IMPORT_EXPORT.md.

import prisma from '../utils/prisma'
import type { ExportSection } from '@infernolog/core'

export const EXPORT_DEFAULT_LIMIT = 500
export const EXPORT_MAX_LIMIT = 1000

const iso = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 10) : null

// Reserved collection types → the import keyword; custom collections export by name.
const LIST_KEYWORD: Record<string, string> = {
  WANT_TO_BEAT: 'want_to_beat',
  FAVORITES: 'favorites',
  LEAST_FAVORITES: 'least_favorites',
}

async function exportCompletions(userId: string, skip: number, take: number) {
  const lps = await prisma.levelProgress.findMany({
    where: { userId, progressUpdates: { some: { isCompletion: true } } },
    orderBy: { createdAt: 'asc' },
    skip,
    take,
    select: {
      levelId: true,
      worstFail: true,
      worstFailDate: true,
      visibility: true,
      levelNotes: true,
      level: { select: { name: true, creator: true } },
      progressUpdates: {
        where: { isCompletion: true },
        take: 1,
        select: {
          date: true,
          dateUncertain: true,
          attempts: true,
          runFrom: true,
          runTo: true,
          onStream: true,
          fps: true,
          device: true,
          enjoyment: true,
          simpleRating: true,
          difficultyOpinion: true,
          difficultyOpinionStars: true,
          coinsCollected: true,
          twoPlayerSolo: true,
          twoPlayerPartner: true,
          inGameDifficulty: true,
          notes: true,
          videoUrl: true,
          highlightUrl: true,
          listReferences: { select: { listSource: true, tierOrRank: true } },
        },
      },
    },
  })

  return lps.flatMap((lp) => {
    const pu = lp.progressUpdates[0]
    if (!pu) return []
    const gddl =
      pu.listReferences.find((r) => r.listSource === 'GDDL')?.tierOrRank ?? null
    const nlw =
      pu.listReferences.find((r) => r.listSource === 'NLW')?.tierOrRank ?? null
    return [
      {
        levelId: lp.levelId,
        levelName: lp.level.name,
        creator: lp.level.creator,
        inGameDifficulty: pu.inGameDifficulty,
        date: iso(pu.date),
        dateUncertain: pu.dateUncertain,
        attempts: pu.attempts,
        percentage: lp.worstFail,
        worstFailDate: iso(lp.worstFailDate),
        runFrom: pu.runFrom,
        runTo: pu.runTo,
        onStream: pu.onStream,
        fps: pu.fps,
        device: pu.device,
        enjoyment: pu.enjoyment,
        simpleRating: pu.simpleRating,
        difficultyOpinion: pu.difficultyOpinion,
        difficultyOpinionStars: pu.difficultyOpinionStars,
        coinsCollected: pu.coinsCollected,
        twoPlayerSolo: pu.twoPlayerSolo,
        twoPlayerPartner: pu.twoPlayerPartner,
        visibility: lp.visibility,
        notes: pu.notes,
        levelNotes: lp.levelNotes,
        gddlTier: gddl,
        nlwTier: nlw,
        videoUrl: pu.videoUrl,
        highlightUrl: pu.highlightUrl,
      },
    ]
  })
}

async function exportDropped(userId: string, skip: number, take: number) {
  const lps = await prisma.levelProgress.findMany({
    where: { userId, status: 'DROPPED' },
    orderBy: { createdAt: 'asc' },
    skip,
    take,
    select: {
      levelId: true,
      worstFail: true,
      attemptsAtDrop: true,
      droppedAt: true,
      droppedReason: true,
      level: { select: { name: true, creator: true, inGameDifficulty: true } },
    },
  })
  return lps.map((lp) => ({
    levelId: lp.levelId,
    levelName: lp.level.name,
    creator: lp.level.creator,
    inGameDifficulty: lp.level.inGameDifficulty,
    bestProgress: lp.worstFail,
    attemptsAtDrop: lp.attemptsAtDrop,
    droppedAt: iso(lp.droppedAt),
    reason: lp.droppedReason,
  }))
}

async function exportRanking(userId: string, skip: number, take: number) {
  const rows = await prisma.classicRanking.findMany({
    where: { userId },
    orderBy: { rankingIndex: 'desc' }, // hardest first
    skip,
    take,
    select: {
      levelProgress: {
        select: { levelId: true, level: { select: { name: true } } },
      },
    },
  })
  return rows.map((r, i) => ({
    rank: skip + i + 1,
    levelId: r.levelProgress.levelId,
    levelName: r.levelProgress.level.name,
  }))
}

async function exportCollections(userId: string, skip: number, take: number) {
  const entries = await prisma.collectionEntry.findMany({
    where: { collection: { userId } },
    orderBy: [{ collectionId: 'asc' }, { rankingIndex: 'asc' }],
    skip,
    take,
    select: {
      levelId: true,
      collectionId: true,
      rankingIndex: true,
      level: { select: { name: true } },
      collection: { select: { type: true, name: true } },
    },
  })
  if (entries.length === 0) return []

  // The sheet's position column is 0-based per collection (import sorts each
  // collection's rows by it). A page can start mid-collection, so seed the
  // counter with how many of the first collection's entries precede the page.
  const first = entries[0]!
  let counter =
    skip === 0
      ? 0
      : await prisma.collectionEntry.count({
          where: {
            collectionId: first.collectionId,
            rankingIndex: { lt: first.rankingIndex },
          },
        })
  let currentId = first.collectionId

  return entries.map((e) => {
    if (e.collectionId !== currentId) {
      currentId = e.collectionId
      counter = 0
    }
    return {
      list:
        e.collection.type === 'CUSTOM'
          ? e.collection.name
          : (LIST_KEYWORD[e.collection.type] ?? e.collection.name),
      levelId: e.levelId,
      levelName: e.level.name,
      position: counter++,
    }
  })
}

async function exportRatings(userId: string, skip: number, take: number) {
  const categories = await prisma.ratingCategory.findMany({
    where: { userId },
    select: { id: true, name: true },
  })
  const catNameById = new Map(categories.map((c) => [c.id, c.name]))

  const lps = await prisma.levelProgress.findMany({
    where: {
      userId,
      progressUpdates: {
        some: { isCompletion: true, ratingScores: { some: {} } },
      },
    },
    orderBy: { createdAt: 'asc' },
    skip,
    take,
    select: {
      levelId: true,
      level: { select: { name: true, creator: true } },
      progressUpdates: {
        where: { isCompletion: true },
        take: 1,
        select: {
          inGameDifficulty: true,
          ratingScores: { select: { categoryId: true, score: true } },
        },
      },
    },
  })

  return lps.flatMap((lp) => {
    const pu = lp.progressUpdates[0]
    if (!pu || pu.ratingScores.length === 0) return []
    const scores: Record<string, number> = {}
    for (const s of pu.ratingScores) {
      const name = catNameById.get(s.categoryId)
      if (name) scores[name] = s.score
    }
    if (Object.keys(scores).length === 0) return []
    return [
      {
        levelId: lp.levelId,
        levelName: lp.level.name,
        creator: lp.level.creator,
        inGameDifficulty: pu.inGameDifficulty,
        scores,
      },
    ]
  })
}

async function exportCategories(userId: string): Promise<string[]> {
  const categories = await prisma.ratingCategory.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    select: { name: true },
  })
  return categories.map((c) => c.name)
}

// One page of a section. `hasMore` is true when a full page came back, so the
// client keeps advancing the offset. `categories` is small and never paginated.
export async function exportSection(
  userId: string,
  section: ExportSection,
  offset: number,
  limit: number
): Promise<{ items: unknown[]; hasMore: boolean }> {
  if (section === 'categories') {
    return { items: await exportCategories(userId), hasMore: false }
  }

  const fetchers = {
    completions: exportCompletions,
    dropped: exportDropped,
    ranking: exportRanking,
    collections: exportCollections,
    ratings: exportRatings,
  } as const

  const items = await fetchers[section](userId, offset, limit)
  return { items, hasMore: items.length === limit }
}
