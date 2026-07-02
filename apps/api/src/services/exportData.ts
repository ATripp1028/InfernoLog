// Account export — gathers everything the import format can carry, in a faithful
// domain form. The client formats it into the import-compatible spreadsheet
// (date formatting, 0-100 → 0-10 rating scale, coin bitmask → columns).
//
// What it intentionally does NOT include (out of the import model / user-only):
// rating category weights + mode, progress history beyond the completion,
// AREDL references, and system timestamps. See docs/IMPORT_EXPORT.md.

import prisma from '../utils/prisma'
import type { ExportResponse } from '@infernolog/core'

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

// Reserved list types → the import keyword; custom lists export by name.
const LIST_KEYWORD: Record<string, string> = {
  WANT_TO_BEAT: 'want_to_beat',
  FAVORITES: 'favorites',
  LEAST_FAVORITES: 'least_favorites',
}

export async function buildExport(userId: string): Promise<ExportResponse> {
  // ── Completions ───────────────────────────────────────────────────────
  const completionLps = await prisma.levelProgress.findMany({
    where: { userId, progressUpdates: { some: { isCompletion: true } } },
    orderBy: { createdAt: 'asc' },
    select: {
      levelId: true,
      worstFail: true,
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

  const completions: ExportResponse['completions'] = completionLps.flatMap((lp) => {
    const pu = lp.progressUpdates[0]
    if (!pu) return []
    const gddl = pu.listReferences.find((r) => r.listSource === 'GDDL')?.tierOrRank ?? null
    const nlw = pu.listReferences.find((r) => r.listSource === 'NLW')?.tierOrRank ?? null
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

  // ── Dropped ───────────────────────────────────────────────────────────
  const droppedLps = await prisma.levelProgress.findMany({
    where: { userId, status: 'DROPPED' },
    orderBy: { createdAt: 'asc' },
    select: {
      levelId: true,
      worstFail: true,
      attemptsAtDrop: true,
      droppedAt: true,
      droppedReason: true,
      level: { select: { name: true, creator: true, inGameDifficulty: true } },
    },
  })
  const dropped: ExportResponse['dropped'] = droppedLps.map((lp) => ({
    levelId: lp.levelId,
    levelName: lp.level.name,
    creator: lp.level.creator,
    inGameDifficulty: lp.level.inGameDifficulty,
    bestProgress: lp.worstFail,
    attemptsAtDrop: lp.attemptsAtDrop,
    droppedAt: iso(lp.droppedAt),
    reason: lp.droppedReason,
  }))

  // ── Ranking (hardest first) ───────────────────────────────────────────
  const rankingRows = await prisma.classicRanking.findMany({
    where: { userId },
    orderBy: { rankingIndex: 'desc' },
    select: { levelProgress: { select: { levelId: true, level: { select: { name: true } } } } },
  })
  const ranking: ExportResponse['ranking'] = rankingRows.map((r, i) => ({
    rank: i + 1,
    levelId: r.levelProgress.levelId,
    levelName: r.levelProgress.level.name,
  }))

  // ── Lists ─────────────────────────────────────────────────────────────
  const userLists = await prisma.userList.findMany({
    where: { userId },
    select: {
      name: true,
      type: true,
      entries: {
        orderBy: { position: 'asc' },
        select: { levelId: true, position: true, level: { select: { name: true } } },
      },
    },
  })
  const lists: ExportResponse['lists'] = userLists.flatMap((ul) => {
    const listCol = ul.type === 'CUSTOM' ? ul.name : (LIST_KEYWORD[ul.type] ?? ul.name)
    return ul.entries.map((e) => ({
      list: listCol,
      levelId: e.levelId,
      levelName: e.level.name,
      position: e.position,
    }))
  })

  // ── Ratings ───────────────────────────────────────────────────────────
  const categories = await prisma.ratingCategory.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  })
  const catNameById = new Map(categories.map((c) => [c.id, c.name]))
  const ratingCategories = categories.map((c) => c.name)

  const scoredLps = await prisma.levelProgress.findMany({
    where: {
      userId,
      progressUpdates: { some: { isCompletion: true, ratingScores: { some: {} } } },
    },
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
  const ratings: ExportResponse['ratings'] = scoredLps.flatMap((lp) => {
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

  return { completions, dropped, ranking, lists, ratingCategories, ratings }
}
