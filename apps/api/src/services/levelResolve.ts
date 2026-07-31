// Shared find-or-resolve for a level, used by both the logging flow's
// `/resolve` endpoint and the Global Level Page's `/page` endpoint so a cache
// miss is handled identically in both: find the cached row, else fetch GD once,
// persist, and return it. The two endpoints shape their own responses on top of
// this (resolve adds the GDDL tier + existing completion; page adds
// hasUserProgress) — this owns only the cache-or-fetch core.

import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import {
  fetchRobtopLevelResult,
  type RobtopLevel,
} from '../utils/robtop'
import { checkSfhNongIfDue } from './sfhSync'

// The Level create payload for a freshly-resolved RobTop level. Shared so the
// `/resolve` endpoint and this service write an identical snapshot. Stored
// data_source=robtop_autofill, verified=true.
export function buildRobtopCreateData(
  levelId: string,
  gd: RobtopLevel
): Prisma.LevelUncheckedCreateInput {
  return {
    inGameId: levelId,
    levelType: gd.platformer ? 'PLATFORMER' : 'CLASSIC',
    name: gd.name,
    creator: gd.creator,
    inGameDifficulty: gd.inGameDifficulty,
    length: gd.length,
    songName: gd.songName,
    songAuthor: gd.songAuthor,
    isRated: gd.isRated,
    isDemon: gd.isDemon,
    // Extended RobTop metadata snapshot.
    description: gd.description,
    creatorPlayerId: gd.creatorPlayerId,
    creatorAccountId: gd.creatorAccountId,
    stars: gd.stars,
    starsRequested: gd.starsRequested,
    partialDiff: gd.partialDiff,
    downloads: gd.downloads,
    likes: gd.likes,
    disliked: gd.disliked,
    objectCount: gd.objectCount,
    coins: gd.coins,
    coinsVerified: gd.coinsVerified,
    featured: gd.featured,
    featureScore: gd.featureScore,
    epicValue: gd.epicValue,
    twoPlayer: gd.twoPlayer,
    lowDetailMode: gd.lowDetailMode,
    copiedFromId: gd.copiedFromId,
    levelVersion: gd.levelVersion,
    gameVersion: gd.gameVersion,
    officialSongId: gd.officialSongId,
    songId: gd.songId,
    songLink: gd.songLink,
    songSize: gd.songSize,
    dataSource: 'robtop_autofill',
    verified: true,
  }
}

export type FindOrResolveResult<T> =
  | { status: 'found'; level: T }
  // GD answered but has no such level — terminal, nothing is cached, so a
  // later visit re-resolves.
  | { status: 'not_found' }
  // The GD call itself couldn't complete — retryable, says nothing about
  // whether the level exists.
  | { status: 'unreachable' }

// Find the cached level, or resolve it from GD once and persist it. On a fresh
// resolve the SFH NONG check runs before the row is re-read, so the returned
// row already carries any NONG data on first load. `select` is the caller's
// Prisma select, so each endpoint gets exactly the columns it renders.
export async function findOrResolveLevel<T extends Prisma.LevelSelect>(
  levelId: string,
  select: T
): Promise<FindOrResolveResult<Prisma.LevelGetPayload<{ select: T }>>> {
  const cached = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select,
  })
  if (cached) return { status: 'found', level: cached }

  const gd = await fetchRobtopLevelResult(levelId)
  if (gd.status === 'not_found') return { status: 'not_found' }
  if (gd.status === 'unreachable') return { status: 'unreachable' }

  await prisma.level.create({ data: buildRobtopCreateData(levelId, gd.level) })

  // Populate NONG data on this first resolve so the page can render it
  // immediately rather than only on the next visit. Best-effort and never
  // throws (see checkSfhNongIfDue); we re-read afterward to pick up whatever it
  // persisted.
  await checkSfhNongIfDue(levelId)

  const level = await prisma.level.findUniqueOrThrow({
    where: { inGameId: levelId },
    select,
  })
  return { status: 'found', level }
}
