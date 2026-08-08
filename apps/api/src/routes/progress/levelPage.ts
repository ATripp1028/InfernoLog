// GET /v1/me/progress/:levelId — the Level Page payload.
//
// Returns: level_progress fields, level metadata, ALL progress_updates (with
// list_references and rating_scores, newest-first), classicRanking placement,
// and the computed runsGraph array (see computeRunsGraph).
//
// The Level Page timeline shows complete history without the "show
// non-completions" toggle — that toggle governs The List and The Ranking only.

import { Hono } from 'hono'
import prisma from '../../utils/prisma'
import { computeRunsGraph } from '../../utils/runsGraph'
import type { HonoVariables } from '../../types/hono'
import { toNum } from '../../utils/decimal'

const app = new Hono<{ Variables: HonoVariables }>()

app.get('/me/progress/:levelId', async (c) => {
  const userId = c.get('userId')
  const { levelId } = c.req.param()

  const lp = await prisma.levelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } },
    select: {
      id: true,
      status: true,
      visibility: true,
      levelNotes: true,
      worstFail: true,
      worstFailDate: true,
      worstFailDateTimezone: true,
      userGddlTier: true,
      simpleRating: true,
      coinsCollected: true,
      completionTime: true,
      createdAt: true,
      updatedAt: true,
      classicRanking: {
        select: { id: true, rankingIndex: true },
      },
      ratingScores: {
        select: { categoryId: true, score: true },
      },
      level: {
        select: {
          inGameId: true,
          name: true,
          creator: true,
          levelType: true,
          inGameDifficulty: true,
          isDemon: true,
          isRated: true,
          featured: true,
          epicValue: true,
          length: true,
          songName: true,
          songAuthor: true,
          // NONG / Song File Hub data (null unless isNong).
          isNong: true,
          sfhId: true,
          sfhSongName: true,
          sfhYoutubeUrl: true,
          sfhYoutubeVideoId: true,
          sfhDownloadUrl: true,
          sfhFileType: true,
          sfhDownloads: true,
          coins: true,
          coinsVerified: true,
          twoPlayer: true,
          officialSongId: true,
        },
      },
      progressUpdates: {
        orderBy: { loggedAt: 'desc' },
        select: {
          id: true,
          kind: true,
          percentage: true,
          runFrom: true,
          runTo: true,
          attempts: true,
          date: true,
          dateTimezone: true,
          dateUncertain: true,
          onStream: true,
          fps: true,
          percentageVersion: true,
          enjoyment: true,
          difficultyOpinion: true,
          notes: true,
          videoUrl: true,
          highlightUrl: true,
          loggedAt: true,
          twoPlayerSolo: true,
          twoPlayerPartner: true,
          device: true,
        },
      },
    },
  })

  // No entry → 404 (whether the level doesn't exist or the user never logged it).
  if (!lp) return c.json({ error: 'Level progress not found' }, 404)

  // Build runsGraph. Drops are now ordinary progress_update rows (kind=DROP)
  // rather than level_progress-level fields, so every historical drop is
  // always present in lp.progressUpdates — no existence check needed, and a
  // level dropped more than once (drop → resume → drop again) keeps each
  // drop's own date/attempts/notes instead of the latest overwriting the rest.
  //
  // worstFail is still a level_progress-level rolling value (the logging UI
  // asks for it once and remembers it), so it can only ever describe the
  // CURRENT drop — attach it to the chronologically latest DROP row only.
  // For a COMPLETED level it's already surfaced as its own milestone bar
  // below (worstFailForGraph), so exclude it here to avoid a duplicate
  // synthetic bar for the same %.
  const dropUpdates = lp.progressUpdates.filter((u) => u.kind === 'DROP')
  const latestDropId = dropUpdates.reduce(
    (latest: (typeof dropUpdates)[number] | null, u) =>
      !latest || u.loggedAt > latest.loggedAt ? u : latest,
    null
  )?.id
  const drops = dropUpdates.map((u) => ({
    droppedAt: u.date,
    worstFail:
      lp.status !== 'COMPLETED' && u.id === latestDropId ? lp.worstFail : null,
  }))

  // runsGraph expects oldest-first; progressUpdates above is newest-first.
  // DROP-kind rows are excluded here — they're merged in via `drops` above.
  const updatesForGraph = [...lp.progressUpdates]
    .reverse()
    .filter((u) => u.kind !== 'DROP')
    .map((u) => ({
      id: u.id,
      isCompletion: u.kind === 'COMPLETION',
      percentage: toNum(u.percentage),
      runFrom: u.runFrom,
      runTo: u.runTo,
      date: u.date,
      dateUncertain: u.dateUncertain,
      loggedAt: u.loggedAt,
    }))

  // For completed levels, pass the worst-fail milestone so it appears as a
  // distinct bar in the timeline. Dropped levels use the drop-merge rule instead.
  const worstFailForGraph =
    lp.status === 'COMPLETED' && lp.worstFail != null
      ? { percentage: lp.worstFail, date: lp.worstFailDate }
      : null

  const runsGraph = computeRunsGraph(updatesForGraph, drops, worstFailForGraph)

  // Derive rank position from rankingIndex: count how many of the user's
  // placed completions have a higher (easier) rankingIndex. 1-based.
  let rankPosition: number | null = null
  if (lp.classicRanking) {
    const count = await prisma.classicRanking.count({
      where: {
        userId,
        rankingIndex: { gt: lp.classicRanking.rankingIndex },
      },
    })
    rankPosition = count + 1
  }

  // Find the completion update (if any) for video/highlight URLs.
  const completionUpdate =
    lp.progressUpdates.find((u) => u.kind === 'COMPLETION') ?? null

  return c.json({
    data: {
      levelProgressId: lp.id,
      status: lp.status,
      visibility: lp.visibility,
      levelNotes: lp.levelNotes,
      worstFail: lp.worstFail,
      worstFailDate: lp.worstFailDate,
      worstFailDateTimezone: lp.worstFailDateTimezone,
      userGddlTier: lp.userGddlTier,
      // One current value per level, not per event.
      simpleRating: lp.simpleRating,
      ratingScores: lp.ratingScores,
      coinsCollected: lp.coinsCollected,
      completionTime: lp.completionTime,
      createdAt: lp.createdAt,
      updatedAt: lp.updatedAt,
      // Ranking placement (null if unplaced or not completed)
      rankingIndex: lp.classicRanking
        ? toNum(lp.classicRanking.rankingIndex)
        : null,
      rankPosition,
      // Completion media (video/highlight) — unambiguous in v1 (one completion
      // per level). In v3 (rebeat), "which video is the hero" is deferred to
      // the rebeat design. See ProgressUpdate.videoUrl in schema.prisma.
      completionVideoUrl: completionUpdate?.videoUrl ?? null,
      completionHighlightUrl: completionUpdate?.highlightUrl ?? null,
      level: lp.level,
      progressUpdates: lp.progressUpdates.map((u) => ({
        progressUpdateId: u.id,
        kind: u.kind,
        percentage: toNum(u.percentage),
        runFrom: u.runFrom,
        runTo: u.runTo,
        attempts: u.attempts,
        date: u.date,
        dateTimezone: u.dateTimezone,
        dateUncertain: u.dateUncertain,
        onStream: u.onStream,
        fps: u.fps,
        percentageVersion: u.percentageVersion,
        enjoyment: u.enjoyment,
        difficultyOpinion: u.difficultyOpinion,
        notes: u.notes,
        videoUrl: u.videoUrl,
        highlightUrl: u.highlightUrl,
        loggedAt: u.loggedAt,
        twoPlayerSolo: u.twoPlayerSolo,
        twoPlayerPartner: u.twoPlayerPartner,
        device: u.device,
      })),
      runsGraph,
    },
  })
})

export default app
