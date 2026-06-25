import type { GddlSyncResult } from '@infernolog/core'
import prisma from '../utils/prisma'
import {
  fetchGddlUserInfo,
  fetchAllGddlSubmissions,
  type GddlSubmission,
} from '../utils/gddl'
import { fetchRobtopLevel } from '../utils/robtop'
import { findOrCreateLevelProgress } from './progress'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

// GDDL uses sequential IDs 1–3 for the three official demon main levels rather
// than GD's real in-game IDs. Map to the canonical GD level IDs so submissions
// for these levels resolve to the correct entry in InfernoLog's levels cache.
const GDDL_OFFICIAL_LEVEL_ID_MAP: Record<string, string> = {
  '1': '14', // Clubstep
  '2': '18', // Theory of Everything 2
  '3': '20', // Deadlocked
}

// Ensures the level exists in the cache. On a cache miss, tries RobTop first,
// then falls back to the GDDL metadata. Returns the level's inGameDifficulty.
// Throws if no usable name can be found (caller skips the submission).
async function getOrCreateLevel(
  tx: Tx,
  levelId: string,
  submission: GddlSubmission
): Promise<string | null> {
  const existing = await tx.level.findUnique({
    where: { inGameId: levelId },
    select: { inGameDifficulty: true },
  })
  if (existing) return existing.inGameDifficulty

  // Cache miss — try RobTop first.
  const gd = await fetchRobtopLevel(levelId)
  if (gd) {
    // Prefer RobTop's name; fall back to GDDL metadata if RobTop returned null
    // (happens for deleted/anonymized levels that still exist in GD's index).
    const name = gd.name ?? submission.Level?.Meta?.Name?.trim() ?? null
    const created = await tx.level.create({
      data: {
        inGameId: levelId,
        levelType: gd.platformer ? 'PLATFORMER' : 'CLASSIC',
        name,
        creator: gd.creator,
        inGameDifficulty: gd.inGameDifficulty,
        length: gd.length,
        songName: gd.songName,
        songAuthor: gd.songAuthor,
        isRated: gd.isRated,
        isDemon: gd.isDemon,
        description: gd.description,
        creatorPlayerId: gd.creatorPlayerId,
        creatorAccountId: gd.creatorAccountId,
        creatorPoints: gd.creatorPoints,
        stars: gd.stars,
        starsRequested: gd.starsRequested,
        partialDiff: gd.partialDiff,
        difficultyFace: gd.difficultyFace,
        downloads: gd.downloads,
        likes: gd.likes,
        disliked: gd.disliked,
        objectCount: gd.objectCount,
        largeLevel: gd.largeLevel,
        coins: gd.coins,
        coinsVerified: gd.coinsVerified,
        orbs: gd.orbs,
        diamonds: gd.diamonds,
        featured: gd.featured,
        featureScore: gd.featureScore,
        epicValue: gd.epicValue,
        twoPlayer: gd.twoPlayer,
        lowDetailMode: gd.lowDetailMode,
        copiedFromId: gd.copiedFromId,
        levelVersion: gd.levelVersion,
        gameVersion: gd.gameVersion,
        editorSeconds: gd.editorSeconds,
        editorSecondsTotal: gd.editorSecondsTotal,
        officialSongId: gd.officialSongId,
        songId: gd.songId,
        songLink: gd.songLink,
        songSize: gd.songSize,
        dataSource: 'robtop_autofill',
        verified: true,
      },
      select: { inGameDifficulty: true },
    })
    return created.inGameDifficulty
  }

  // RobTop unavailable — fall back to GDDL metadata.
  const name = submission.Level?.Meta?.Name?.trim()
  if (!name) throw new Error('missing level name')

  await tx.level.create({
    data: {
      inGameId: levelId,
      name,
      dataSource: 'manual',
      verified: false,
    },
  })
  return null
}

// Maps a GDDL DateAdded string to a JS Date (date-only, stored as @db.Date).
function parseDateAdded(raw: string): Date | null {
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

// Builds the set of fields to write from a GDDL submission. Returns only the
// fields that pass their respective gate so callers can check emptiness.
interface MappedFields {
  date?: Date
  enjoyment?: number
  simpleRating?: number
  videoUrl?: string
}

function mapGddlFields(sub: GddlSubmission): MappedFields {
  const fields: MappedFields = {}
  const date = parseDateAdded(sub.DateAdded)
  if (date) fields.date = date
  // GDDL uses 0-10; InfernoLog stores 0-100 internally.
  if (sub.Enjoyment !== 0) fields.enjoyment = sub.Enjoyment * 10
  if (sub.Rating !== 0) fields.simpleRating = sub.Rating * 10
  if (sub.Proof?.trim()) fields.videoUrl = sub.Proof.trim()
  return fields
}

async function createCompletion(
  tx: Tx,
  userId: string,
  levelId: string,
  inGameDifficulty: string | null,
  sub: GddlSubmission
): Promise<void> {
  const lp = await findOrCreateLevelProgress(tx, userId, levelId, 'COMPLETED')
  const fields = mapGddlFields(sub)

  const pu = await tx.progressUpdate.create({
    data: {
      levelProgressId: lp.id,
      isCompletion: true,
      inGameDifficulty,
      dateUncertain: fields.date !== undefined,
      ...fields,
    },
    select: { id: true },
  })

  await tx.levelProgress.update({
    where: { id: lp.id },
    data: { status: 'COMPLETED', visibility: 'PUBLIC' },
  })

  await tx.listReference.create({
    data: {
      progressUpdateId: pu.id,
      listSource: 'GDDL',
      tierOrRank: sub.Rating.toString(),
      atTimeOfLogging: true,
    },
  })
}

async function enrichCompletion(
  tx: Tx,
  progressUpdateId: string,
  sub: GddlSubmission
): Promise<boolean> {
  // Load current null-able fields from the existing completion.
  const existing = await tx.progressUpdate.findUniqueOrThrow({
    where: { id: progressUpdateId },
    select: {
      date: true,
      enjoyment: true,
      simpleRating: true,
      videoUrl: true,
    },
  })

  const gddl = mapGddlFields(sub)
  const updateData: Record<string, unknown> = {}

  if (existing.date === null && gddl.date !== undefined) {
    updateData.date = gddl.date
    updateData.dateUncertain = true
  }
  if (existing.enjoyment === null && gddl.enjoyment !== undefined) {
    updateData.enjoyment = gddl.enjoyment
  }
  if (existing.simpleRating === null && gddl.simpleRating !== undefined) {
    updateData.simpleRating = gddl.simpleRating
  }
  if (existing.videoUrl === null && gddl.videoUrl !== undefined) {
    updateData.videoUrl = gddl.videoUrl
  }

  const existingRef = await tx.listReference.findFirst({
    where: { progressUpdateId, listSource: 'GDDL' },
    select: { id: true },
  })

  const willWrite = Object.keys(updateData).length > 0 || existingRef === null

  if (!willWrite) return false

  if (Object.keys(updateData).length > 0) {
    await tx.progressUpdate.update({
      where: { id: progressUpdateId },
      data: updateData,
    })
  }

  if (existingRef === null) {
    await tx.listReference.create({
      data: {
        progressUpdateId,
        listSource: 'GDDL',
        tierOrRank: sub.Rating.toString(),
        atTimeOfLogging: false,
      },
    })
  }

  return true
}

export async function syncGddlSubmissions(
  userId: string,
  gddlApiKey: string
): Promise<GddlSyncResult> {
  const result: GddlSyncResult = {
    created: 0,
    enriched: 0,
    skipped: 0,
    errors: [],
  }

  logger.info({ userId }, 'gddlSync: fetching GDDL user info')
  const userInfo = await fetchGddlUserInfo(gddlApiKey)
  logger.info({ userId, gddlUserId: userInfo.id }, 'gddlSync: fetched user info, fetching submissions')

  let submissions: GddlSubmission[]
  try {
    submissions = await fetchAllGddlSubmissions(gddlApiKey, userInfo.id)
    logger.info({ userId, count: submissions.length }, 'gddlSync: fetched all submissions')
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Failed to fetch submissions'
    logger.error({ userId, err }, 'gddlSync: failed to fetch submissions')
    result.errors.push({ levelId: 'unknown', reason })
    return result
  }

  for (const sub of submissions) {
    const rawId = String(sub.Level.ID)
    const levelId = GDDL_OFFICIAL_LEVEL_ID_MAP[rawId] ?? rawId
    try {
      await prisma.$transaction(async (tx) => {
        const inGameDifficulty = await getOrCreateLevel(tx, levelId, sub)

        const lp = await tx.levelProgress.findUnique({
          where: { userId_levelId: { userId, levelId } },
          select: { id: true, status: true },
        })

        const existingCompletion = lp
          ? await tx.progressUpdate.findFirst({
              where: { levelProgressId: lp.id, isCompletion: true },
              select: { id: true },
            })
          : null

        if (existingCompletion) {
          const enriched = await enrichCompletion(tx, existingCompletion.id, sub)
          if (enriched) {
            result.enriched++
          } else {
            result.skipped++
          }
        } else {
          await createCompletion(tx, userId, levelId, inGameDifficulty, sub)
          result.created++
        }
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ levelId, err }, 'GDDL sync: error processing submission')
      Sentry.captureException(err)
      result.errors.push({ levelId, reason })
    }
  }

  return result
}
