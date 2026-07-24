// SQS consumer — async metadata enrichment for stub levels created during
// spreadsheet import. On success the stub row is upgraded to
// data_source='robtop_autofill', verified=true. On failure (RobTop
// unavailable or level not found) the stub stands — this is NOT an error;
// the DLQ is just a safety net for infra failures.
//
// Pacing against RobTop is handled by the shared rate limiter every caller
// of fetchRobtopLevel goes through (see utils/robtopRateLimit.ts) — this
// worker doesn't need (and no longer does) its own local sleep-based pacing
// between levels; that would just be a second, redundant ceiling on top of
// the real one.

import prisma from '../utils/prisma'
import { fetchRobtopLevel } from '../utils/robtop'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

interface SeedMessage {
  levelIds: string[]
}

interface SQSRecord {
  body: string
}

interface SQSEvent {
  Records: SQSRecord[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// fetchRobtopLevel collapses "genuinely not found" and "transient network
// failure" into the same null (see its GOLDEN RULE) — this worker can't tell
// them apart, so a null gets a couple of re-attempts before the stub is left
// standing. Without this, a single blip during a big import batch stranded
// that level with no metadata until the next weekly volatile sync (which
// doesn't run for up to a week, and only backfills a few fields even then)
// rather than the few extra seconds retries cost here.
//
// The backoff between attempts here is a distinct concern from the shared
// rate limiter: it's not about this worker's own request rate (the limiter
// already owns that), it's about not immediately re-hitting the exact same
// level that just failed, in case that specific failure needs a moment to
// clear.
const FETCH_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [1000, 3000]

async function fetchRobtopLevelWithRetries(levelId: string) {
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 1000)
    const robtop = await fetchRobtopLevel(levelId)
    if (robtop) return robtop
  }
  return null
}

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    let message: SeedMessage
    try {
      message = JSON.parse(record.body) as SeedMessage
    } catch {
      logger.warn({ body: record.body }, 'levelSeedWorker: unparseable message')
      continue
    }

    const { levelIds } = message
    if (!Array.isArray(levelIds) || !levelIds.length) continue

    for (const levelId of levelIds) {
      if (!levelId) continue

      try {
        // Skip if already verified (another consumer beat us to it).
        const existing = await prisma.level.findUnique({
          where: { inGameId: levelId },
          select: { verified: true },
        })
        if (existing?.verified) continue

        const robtop = await fetchRobtopLevelWithRetries(levelId)
        if (!robtop) {
          // RobTop didn't find it after retries — stub stands. Not a failure.
          logger.info(
            { levelId },
            'levelSeedWorker: no RobTop result; stub retained'
          )
          continue
        }

        await prisma.level.update({
          where: { inGameId: levelId },
          data: {
            name: robtop.name,
            creator: robtop.creator,
            inGameDifficulty: robtop.inGameDifficulty,
            length: robtop.length,
            songName: robtop.songName,
            songAuthor: robtop.songAuthor,
            isRated: robtop.isRated,
            isDemon: robtop.isDemon,
            levelType: robtop.platformer ? 'PLATFORMER' : 'CLASSIC',
            description: robtop.description,
            creatorPlayerId: robtop.creatorPlayerId,
            creatorAccountId: robtop.creatorAccountId,
            stars: robtop.stars,
            starsRequested: robtop.starsRequested,
            partialDiff: robtop.partialDiff,
            downloads: robtop.downloads,
            likes: robtop.likes,
            disliked: robtop.disliked,
            objectCount: robtop.objectCount,
            coins: robtop.coins,
            coinsVerified: robtop.coinsVerified,
            featured: robtop.featured,
            featureScore: robtop.featureScore,
            epicValue: robtop.epicValue,
            twoPlayer: robtop.twoPlayer,
            lowDetailMode: robtop.lowDetailMode,
            copiedFromId: robtop.copiedFromId,
            levelVersion: robtop.levelVersion,
            gameVersion: robtop.gameVersion,
            officialSongId: robtop.officialSongId,
            songId: robtop.songId,
            songLink: robtop.songLink,
            songSize: robtop.songSize,
            dataSource: 'robtop_autofill',
            verified: true,
            lastCheckedAt: new Date(),
          },
        })

        logger.info({ levelId }, 'levelSeedWorker: enriched stub level')
      } catch (err) {
        // Log and capture; let the message eventually reach the DLQ rather
        // than blocking the rest of the batch.
        logger.error({ levelId, err }, 'levelSeedWorker: error enriching level')
        Sentry.captureException(err)
      }
    }
  }
}
