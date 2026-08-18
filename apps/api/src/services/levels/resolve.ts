// Shared find-or-resolve for a level, used by both the logging flow's
// `/resolve` endpoint and the Global Level Page's `/page` endpoint so a cache
// miss is handled identically in both: find the cached row, else fetch GD once,
// persist, and return it. The two endpoints shape their own responses on top of
// this (resolve adds the GDDL tier + existing completion; page adds
// hasUserProgress) — this owns only the cache-or-fetch core.

import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { fetchRobtopLevelResult } from '../../utils/robtop'
import { checkSfhNongIfDue } from '../levels/sfhSync'
import { buildRobtopCreateData } from './robtopMapping'

/**
 * Outcome of a cache-or-fetch level lookup. `not_found` is terminal (GD
 * answered; nothing was cached, so a later visit re-resolves) while
 * `unreachable` is retryable and says nothing about whether the level exists —
 * callers surface them as 404 and 503 respectively.
 */
export type FindOrResolveResult<T> =
  | { status: 'found'; level: T }
  // GD answered but has no such level — terminal, nothing is cached, so a
  // later visit re-resolves.
  | { status: 'not_found' }
  // The GD call itself couldn't complete — retryable, says nothing about
  // whether the level exists.
  | { status: 'unreachable' }

/**
 * Find the cached level, or resolve it from GD once and persist it. On a fresh
 * resolve the SFH NONG check runs before the row is re-read, so the returned
 * row already carries any NONG data on first load. `select` is the caller's
 * Prisma select, so each endpoint gets exactly the columns it renders.
 *
 * @param levelId - GD level id (already validated as numeric by the caller).
 * @param select - The caller's Prisma select.
 * @param onCacheMiss - Optional hook run ONLY when the cache misses and just
 * before GD is called, so a caller can meter or refuse the outbound request
 * (`/page` charges the per-user RobTop budget here). Whatever it throws
 * propagates unchanged — the level is not fetched and nothing is written. The
 * cache-hit path never invokes it, which is what keeps a hit free.
 */
export async function findOrResolveLevel<T extends Prisma.LevelSelect>(
  levelId: string,
  select: T,
  onCacheMiss?: () => Promise<void>
): Promise<FindOrResolveResult<Prisma.LevelGetPayload<{ select: T }>>> {
  const cached = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select,
  })
  if (cached) return { status: 'found', level: cached }

  await onCacheMiss?.()

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
