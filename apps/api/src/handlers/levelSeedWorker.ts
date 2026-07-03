// SQS consumer — async metadata enrichment for stub levels created during
// spreadsheet import. Reserved concurrency 1 (set in sst.config.ts) ensures
// no two invocations run concurrently, making in-handler pacing (~1.5 req/s)
// the true system-wide rate limit against RobTop.
//
// Each SQS message carries a small batch of level IDs (5-10). On success the
// stub row is upgraded to data_source='robtop_autofill', verified=true.
// On failure (RobTop unavailable or level not found) the stub stands — this
// is NOT an error; the DLQ is just a safety net for infra failures.

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

// ~670ms between RobTop calls keeps us just under 1.5 req/s.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const PACE_MS = 670

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

    for (let i = 0; i < levelIds.length; i++) {
      const levelId = levelIds[i]
      if (!levelId) continue

      if (i > 0) await sleep(PACE_MS)

      try {
        // Skip if already verified (another consumer beat us to it).
        const existing = await prisma.level.findUnique({
          where: { inGameId: levelId },
          select: { verified: true },
        })
        if (existing?.verified) continue

        const robtop = await fetchRobtopLevel(levelId)
        if (!robtop) {
          // RobTop didn't find it — stub stands. Not a failure.
          logger.info({ levelId }, 'levelSeedWorker: no RobTop result; stub retained')
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
            difficultyFace: robtop.difficultyFace,
            downloads: robtop.downloads,
            likes: robtop.likes,
            disliked: robtop.disliked,
            objectCount: robtop.objectCount,
            largeLevel: robtop.largeLevel,
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
            editorSeconds: robtop.editorSeconds,
            editorSecondsTotal: robtop.editorSecondsTotal,
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
