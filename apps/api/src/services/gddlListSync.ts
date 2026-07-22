// Bidirectional sync between InfernoLog FAVORITES / LEAST_FAVORITES collections
// and the corresponding GDDL user lists.
//
// Direction A — GDDL → InfernoLog:
//   Levels that are in the GDDL list but absent from the InfernoLog collection
//   are added (appended at the end). If the level is not yet in the Level cache
//   it is seeded from RobTop first; if RobTop also cannot supply it the level is
//   skipped and listed in `skipped`.
//
// Direction B — InfernoLog → GDDL:
//   GDDL caps its non-custom lists at 4 entries. We sync the top 4 InfernoLog
//   entries (by rankingIndex asc, i.e. the user's preferred order) to GDDL:
//   - levels in the top 4 that are not yet in GDDL are POSTed
//   - levels in GDDL that are no longer in the top 4 are DELETEd
//   InfernoLog itself is never truncated to 4; only the GDDL side is capped.

import prisma from '../utils/prisma'
import { Prisma } from '@prisma/client'
import {
  fetchGddlUserInfo,
  fetchGddlList,
  addGddlListEntry,
  removeGddlListEntry,
} from '../utils/gddl'
import { fetchRobtopLevel, type RobtopLevel } from '../utils/robtop'
import { bisectIndices } from '../utils/fractionalIndex'
import { logger } from '../utils/logger'

// GDDL's non-custom lists cap at 4 entries. Only the top N InfernoLog entries
// (by display order / rankingIndex) are mirrored to GDDL.
const GDDL_LIST_MAX = 4

export interface ListSyncSummary {
  addedToInferno: string[] // GDDL level IDs added to the InfernoLog collection
  addedToGddl: string[] // InfernoLog level IDs pushed to GDDL
  removedFromGddl: string[] // Level IDs removed from GDDL (outside top-N)
  skipped: string[] // GDDL IDs that couldn't be cached — not added
}

export interface GddlListSyncResult {
  favorites: ListSyncSummary
  leastFavorites: ListSyncSummary
}

function robtopLevelData(gd: RobtopLevel) {
  return {
    levelType: gd.platformer ? ('PLATFORMER' as const) : ('CLASSIC' as const),
    name: gd.name,
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
    dataSource: 'robtop_autofill' as const,
    verified: true,
  }
}

// Ensures a level exists in the local Level cache. On a miss, attempts to seed
// from RobTop. If a cached row already exists but was never seeded (a stub
// left behind by a prior import that couldn't reach RobTop at the time), retry
// the RobTop fetch and upgrade it in place rather than treating "row exists"
// as "already handled". Returns true if the level is (now) cached — even as
// an unupgraded stub — false only if it could not be found at all and was
// skipped.
async function ensureLevelCached(levelId: string): Promise<boolean> {
  const existing = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select: { inGameId: true, verified: true },
  })
  if (existing?.verified) return true

  const gd = await fetchRobtopLevel(levelId)

  if (existing) {
    // Already cached as a stub — upgrade it if RobTop has data now, otherwise
    // leave the stub standing (it's still usable, just unseeded).
    if (gd) {
      await prisma.level.update({
        where: { inGameId: levelId },
        data: robtopLevelData(gd),
      })
    }
    return true
  }

  if (!gd) return false

  try {
    await prisma.level.create({
      data: { inGameId: levelId, ...robtopLevelData(gd) },
    })
  } catch (err) {
    // P2002 = unique violation — another concurrent request already seeded it.
    if (
      !(
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )
    ) {
      throw err
    }
  }
  return true
}

async function syncList(
  userId: string,
  apiKey: string,
  gddlUserId: number,
  collectionType: 'FAVORITES' | 'LEAST_FAVORITES',
  gddlList: 'favorites' | 'least-favorites'
): Promise<ListSyncSummary> {
  const summary: ListSyncSummary = {
    addedToInferno: [],
    addedToGddl: [],
    removedFromGddl: [],
    skipped: [],
  }

  const [gddlIds, collection] = await Promise.all([
    fetchGddlList(apiKey, gddlUserId, gddlList),
    prisma.collection.findFirst({
      where: { userId, type: collectionType },
      select: {
        id: true,
        entries: {
          orderBy: { rankingIndex: 'asc' },
          select: { levelId: true },
        },
      },
    }),
  ])

  if (!collection) {
    logger.warn(
      { userId, collectionType },
      'gddlListSync: collection not found'
    )
    return summary
  }

  const ilIds = collection.entries.map((e) => e.levelId)
  const ilIdSet = new Set(ilIds)
  const ilTop4 = ilIds.slice(0, GDDL_LIST_MAX)
  const ilTop4Set = new Set(ilTop4)
  const gddlIdSet = new Set(gddlIds)

  // ── Direction A: GDDL → InfernoLog ──────────────────────────────────────────
  for (const gddlId of gddlIds) {
    if (ilIdSet.has(gddlId)) continue

    const cached = await ensureLevelCached(gddlId).catch((err) => {
      logger.warn(
        { gddlId, err },
        `gddlListSync: error caching level ${gddlId}`
      )
      return false
    })
    if (!cached) {
      summary.skipped.push(gddlId)
      continue
    }

    await prisma.$transaction(async (tx) => {
      const dup = await tx.collectionEntry.findUnique({
        where: {
          collectionId_levelId: {
            collectionId: collection.id,
            levelId: gddlId,
          },
        },
        select: { id: true },
      })
      if (dup) return

      const last = await tx.collectionEntry.findFirst({
        where: { collectionId: collection.id },
        orderBy: { rankingIndex: 'desc' },
        select: { rankingIndex: true },
      })
      await tx.collectionEntry.create({
        data: {
          collectionId: collection.id,
          levelId: gddlId,
          rankingIndex: bisectIndices(last?.rankingIndex ?? null, null),
        },
      })
    })

    ilIdSet.add(gddlId)
    summary.addedToInferno.push(gddlId)
  }

  // ── Direction B: InfernoLog → GDDL ──────────────────────────────────────────
  // Add top-4 InfernoLog entries that GDDL is missing.
  for (const ilId of ilTop4) {
    if (gddlIdSet.has(ilId)) continue
    try {
      await addGddlListEntry(apiKey, gddlUserId, gddlList, ilId)
      gddlIdSet.add(ilId)
      summary.addedToGddl.push(ilId)
    } catch (err) {
      logger.warn(
        { ilId, err },
        `gddlListSync: failed to add ${ilId} to GDDL ${gddlList}`
      )
    }
  }

  // Remove from GDDL anything outside the InfernoLog top-4.
  for (const gddlId of gddlIds) {
    if (ilTop4Set.has(gddlId)) continue
    try {
      await removeGddlListEntry(apiKey, gddlUserId, gddlList, gddlId)
      summary.removedFromGddl.push(gddlId)
    } catch (err) {
      logger.warn(
        { gddlId, err },
        `gddlListSync: failed to remove ${gddlId} from GDDL ${gddlList}`
      )
    }
  }

  return summary
}

export async function syncGddlLists(
  userId: string,
  apiKey: string
): Promise<GddlListSyncResult> {
  const userInfo = await fetchGddlUserInfo(apiKey)

  const [favorites, leastFavorites] = await Promise.all([
    syncList(userId, apiKey, userInfo.id, 'FAVORITES', 'favorites'),
    syncList(userId, apiKey, userInfo.id, 'LEAST_FAVORITES', 'least-favorites'),
  ])

  return { favorites, leastFavorites }
}
