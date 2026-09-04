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
//
// Every tab's in_game_difficulty is the level's CURRENT cached difficulty, not
// the snapshot ProgressUpdate took when the entry was logged. The column exists
// to filter name resolution on the way back in, and it is matched against the
// cache as it is then — a stale snapshot could only rule the row's own level
// out. Import re-snapshots from the cache itself and never stores this cell, so
// nothing is lost by it. See ./sheetDifficulty.ts for how the value is spelled.

import prisma from '../../utils/prisma'
import type { ExportSection } from '@infernolog/core'
import { toSheetDifficulty } from './sheetDifficulty'
import { zonedDateString } from '../../utils/timezone'
import { toNum } from '../../utils/decimal'

/** Rows per export page when the caller doesn't ask for a specific limit. */
export const EXPORT_DEFAULT_LIMIT = 500
/** Hard ceiling on a caller-supplied export limit, so one request can't ask
 * for an unbounded page. */
export const EXPORT_MAX_LIMIT = 1000

// `timezone` is the paired dateTimezone/worstFailDateTimezone column — null
// means no time-of-day was entered (date is midnight UTC, a raw slice is
// correct); non-null means the date must be read back through that zone to
// recover the calendar day the user actually entered.
const iso = (d: Date | null, timezone: string | null): string | null =>
  d ? zonedDateString(d, timezone) : null

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
      worstFailDateTimezone: true,
      visibility: true,
      levelNotes: true,
      userGddlTier: true,
      difficultyOpinion: true,
      simpleRating: true,
      coinsCollected: true,
      // stars + the label together resolve the difficulty cell; see
      // toSheetDifficulty.
      level: {
        select: {
          name: true,
          creator: true,
          stars: true,
          inGameDifficulty: true,
        },
      },
      progressUpdates: {
        where: { kind: 'COMPLETION' },
        take: 1,
        select: {
          date: true,
          dateTimezone: true,
          dateUncertain: true,
          attempts: true,
          runFrom: true,
          runTo: true,
          onStream: true,
          fps: true,
          device: true,
          enjoyment: true,
          twoPlayerSolo: true,
          twoPlayerPartner: true,
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
        inGameDifficulty: toSheetDifficulty({
          ...lp.level,
          inGameId: lp.levelId,
        }),
        date: iso(pu.date, pu.dateTimezone),
        dateUncertain: pu.dateUncertain,
        attempts: pu.attempts,
        percentage: lp.worstFail,
        worstFailDate: iso(lp.worstFailDate, lp.worstFailDateTimezone),
        runFrom: pu.runFrom,
        runTo: pu.runTo,
        onStream: pu.onStream,
        fps: pu.fps,
        device: pu.device,
        enjoyment: pu.enjoyment,
        simpleRating: lp.simpleRating,
        difficultyOpinion: lp.difficultyOpinion,
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
      dateTimezone: true,
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
    date: iso(u.date, u.dateTimezone),
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
      dateTimezone: true,
      attempts: true,
      notes: true,
      levelProgress: {
        select: {
          levelId: true,
          status: true,
          worstFail: true,
          level: {
            select: {
              name: true,
              creator: true,
              inGameDifficulty: true,
              // Canonical for a non-demon — the label is the display copy.
              stars: true,
            },
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
      inGameDifficulty: toSheetDifficulty({
        ...lp.level,
        inGameId: lp.levelId,
      }),
      bestProgress: isCurrentDrop ? lp.worstFail : null,
      attemptsAtDrop: u.attempts,
      droppedAt: iso(u.date, u.dateTimezone),
      reason: u.notes,
    }
  })
}

async function exportRanking(userId: string, skip: number, take: number) {
  const rows = await prisma.classicDemonList.findMany({
    where: { userId },
    orderBy: { listIndex: 'desc' }, // hardest first
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

// The "Ranking" tab: everything about how the user rates a level, in one place
// — the manual position, the simple score, and the per-category scores.
//
// Covers every level with a manual position OR any rating at all, because the
// two do not imply each other: a MANUAL user has positions and no numbers, a
// SIMPLE user has numbers and no positions, and both belong in this tab. Rows
// with a position come first, in that order; the rest follow by level id, which
// is stable across exports.
async function exportRatingRanking(
  userId: string,
  skip: number,
  take: number
) {
  const categories = await prisma.ratingCategory.findMany({
    where: { userId },
    select: { id: true, name: true },
  })
  const catNameById = new Map(categories.map((c) => [c.id, c.name]))

  const lps = await prisma.levelProgress.findMany({
    where: {
      userId,
      OR: [
        { ratingRanking: { isNot: null } },
        { ratingScores: { some: {} } },
        { simpleRating: { not: null } },
      ],
    },
    select: {
      levelId: true,
      simpleRating: true,
      ratingRanking: { select: { ratingIndex: true } },
      // stars + the label together resolve the difficulty cell; see
      // toSheetDifficulty.
      level: {
        select: {
          name: true,
          creator: true,
          stars: true,
          inGameDifficulty: true,
        },
      },
      ratingScores: { select: { categoryId: true, score: true } },
    },
  })

  // Sorted here rather than in the query: the ordering key is a nullable
  // relation, and "placed rows first, by index" is not expressible as one
  // orderBy that also falls back to level id for the rest.
  const ordered = [...lps].sort((a, b) => {
    const ai = a.ratingRanking?.ratingIndex
    const bi = b.ratingRanking?.ratingIndex
    if (ai && bi) return bi.comparedTo(ai) // higher index = better = first
    if (ai) return -1
    if (bi) return 1
    return a.levelId.localeCompare(b.levelId)
  })

  return ordered.slice(skip, skip + take).map((lp, i) => {
    const scores: Record<string, number> = {}
    for (const s of lp.ratingScores) {
      const name = catNameById.get(s.categoryId)
      if (name) scores[name] = s.score
    }
    return {
      // Only placed rows carry a position; the rest are ordered but unranked.
      rank: lp.ratingRanking ? skip + i + 1 : null,
      levelId: lp.levelId,
      levelName: lp.level.name,
      creator: lp.level.creator,
      inGameDifficulty: toSheetDifficulty({
        ...lp.level,
        inGameId: lp.levelId,
      }),
      simpleRating: lp.simpleRating,
      scores,
    }
  })
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

async function exportCategories(userId: string): Promise<string[]> {
  const categories = await prisma.ratingCategory.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    select: { name: true },
  })
  return categories.map((c) => c.name)
}

/**
 * One page of a section. `hasMore` is true when a full page came back, so the
 * client keeps advancing the offset. `categories` is small and never paginated.
 */
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
    ratingRanking: exportRatingRanking,
    collections: exportCollections,
  } as const

  const items = await fetchers[section](userId, offset, limit)
  return { items, hasMore: items.length === limit }
}
