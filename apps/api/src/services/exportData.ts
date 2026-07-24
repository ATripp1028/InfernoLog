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
// rating category weights + mode, AREDL references, and system timestamps.
// See docs/IMPORT_EXPORT.md.

import prisma from '../utils/prisma'
import type { ExportSection } from '@infernolog/core'

export const EXPORT_DEFAULT_LIMIT = 500
export const EXPORT_MAX_LIMIT = 1000

const iso = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 10) : null

type DecimalLike = { toNumber(): number }
const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()

// Reserved collection types → the import keyword; custom collections export by name.
const LIST_KEYWORD: Record<string, string> = {
  WANT_TO_BEAT: 'want_to_beat',
  FAVORITES: 'favorites',
  LEAST_FAVORITES: 'least_favorites',
}

async function exportCompletions(userId: string, skip: number, take: number) {
  const lps = await prisma.levelProgress.findMany({
    where: { userId, progressUpdates: { some: { kind: 'COMPLETION' } } },
    orderBy: { createdAt: 'asc' },
    skip,
    take,
    select: {
      levelId: true,
      worstFail: true,
      worstFailDate: true,
      visibility: true,
      levelNotes: true,
      userGddlTier: true,
      simpleRating: true,
      coinsCollected: true,
      level: { select: { name: true, creator: true } },
      progressUpdates: {
        where: { kind: 'COMPLETION' },
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
          difficultyOpinion: true,
          twoPlayerSolo: true,
          twoPlayerPartner: true,
          inGameDifficulty: true,
          notes: true,
          videoUrl: true,
          highlightUrl: true,
        },
      },
    },
  })

  return lps.flatMap((lp) => {
    const pu = lp.progressUpdates[0]
    if (!pu) return []
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
        simpleRating: lp.simpleRating,
        difficultyOpinion: pu.difficultyOpinion,
        coinsCollected: lp.coinsCollected,
        twoPlayerSolo: pu.twoPlayerSolo,
        twoPlayerPartner: pu.twoPlayerPartner,
        visibility: lp.visibility,
        notes: pu.notes,
        levelNotes: lp.levelNotes,
        userGddlTier: lp.userGddlTier,
        videoUrl: pu.videoUrl,
        highlightUrl: pu.highlightUrl,
      },
    ]
  })
}

// Non-completion progress updates — session logs (percentage or run range)
// short of the eventual completion. Not filtered by LevelProgress.status: a
// level that's still IN_PROGRESS, was later DROPPED, or was later COMPLETED
// can all carry these. Multiple rows per level are expected (unlike
// completions/drops, which are one-per-level).
async function exportProgress(userId: string, skip: number, take: number) {
  const updates = await prisma.progressUpdate.findMany({
    where: { kind: 'PROGRESS', levelProgress: { userId } },
    orderBy: { loggedAt: 'asc' },
    skip,
    take,
    select: {
      id: true,
      date: true,
      dateUncertain: true,
      attempts: true,
      percentage: true,
      runFrom: true,
      runTo: true,
      onStream: true,
      fps: true,
      enjoyment: true,
      device: true,
      notes: true,
      highlightUrl: true,
      levelProgress: {
        select: {
          levelId: true,
          visibility: true,
          level: { select: { name: true, creator: true } },
        },
      },
    },
  })

  return updates.map((u) => ({
    progressId: u.id,
    levelId: u.levelProgress.levelId,
    levelName: u.levelProgress.level.name,
    creator: u.levelProgress.level.creator,
    date: iso(u.date),
    dateUncertain: u.dateUncertain,
    attempts: u.attempts,
    percentage: toNum(u.percentage),
    runFrom: u.runFrom,
    runTo: u.runTo,
    onStream: u.onStream,
    fps: u.fps,
    device: u.device,
    enjoyment: u.enjoyment,
    notes: u.notes,
    highlightUrl: u.highlightUrl,
    visibility: u.levelProgress.visibility,
  }))
}

// Drops are now ordinary progress_updates (kind=DROP), so — like Progress —
// this is not filtered by the level's current status: a level dropped and
// later resumed or completed keeps every drop's history. Multiple rows per
// level are expected (drop → resume → drop again).
async function exportDropped(userId: string, skip: number, take: number) {
  const updates = await prisma.progressUpdate.findMany({
    where: { kind: 'DROP', levelProgress: { userId } },
    orderBy: { loggedAt: 'asc' },
    skip,
    take,
    select: {
      id: true,
      date: true,
      attempts: true,
      notes: true,
      levelProgress: {
        select: {
          levelId: true,
          status: true,
          worstFail: true,
          level: {
            select: { name: true, creator: true, inGameDifficulty: true },
          },
          // The level's single most recent update — used below to tell
          // whether this is the level's CURRENT drop.
          progressUpdates: {
            orderBy: { loggedAt: 'desc' },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  })

  return updates.map((u) => {
    const lp = u.levelProgress
    // worstFail is a level-scoped rolling value, not per-drop (the logging UI
    // asks for it once and remembers it), so it only describes the level's
    // CURRENT drop — the most recent update, while still dropped.
    const isCurrentDrop =
      lp.status === 'DROPPED' && lp.progressUpdates[0]?.id === u.id
    return {
      dropId: u.id,
      levelId: lp.levelId,
      levelName: lp.level.name,
      creator: lp.level.creator,
      inGameDifficulty: lp.level.inGameDifficulty,
      bestProgress: isCurrentDrop ? lp.worstFail : null,
      attemptsAtDrop: u.attempts,
      droppedAt: iso(u.date),
      reason: u.notes,
    }
  })
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
      progressUpdates: { some: { kind: 'COMPLETION' } },
      ratingScores: { some: {} },
    },
    orderBy: { createdAt: 'asc' },
    skip,
    take,
    select: {
      levelId: true,
      level: { select: { name: true, creator: true } },
      ratingScores: { select: { categoryId: true, score: true } },
      progressUpdates: {
        where: { kind: 'COMPLETION' },
        take: 1,
        select: { inGameDifficulty: true },
      },
    },
  })

  return lps.flatMap((lp) => {
    const pu = lp.progressUpdates[0]
    if (!pu || lp.ratingScores.length === 0) return []
    const scores: Record<string, number> = {}
    for (const s of lp.ratingScores) {
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
    progress: exportProgress,
    dropped: exportDropped,
    ranking: exportRanking,
    collections: exportCollections,
    ratings: exportRatings,
  } as const

  const items = await fetchers[section](userId, offset, limit)
  return { items, hasMore: items.length === limit }
}
