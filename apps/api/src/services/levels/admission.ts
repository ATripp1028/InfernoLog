// Which levels the shared `levels` cache admits.
//
// InfernoLog tracks demons. A RATED NON-DEMON is never cached, and that single
// refusal is the whole enforcement: progress, collection entries and demon list
// placements all reference `levels` by foreign key, so a level that cannot be
// cached cannot be logged, collected or ranked. No write path checks again.
// Unrated levels are admitted whatever face their votes give them.
//
// The check runs at ADMISSION only — every path that creates a row from a RobTop
// snapshot (see robtopMapping.ts). A level already cached whose rating later
// changes is handled where the change is seen:
//   - a demon GD demotes stays, and keeps working for whoever logged it;
//   - an unrated level GD rates as a non-demon is removed with purgeIfUnused.

import { Prisma } from '@prisma/client'
import type { NotADemonResponse } from '@infernolog/core'
import prisma from '../../utils/prisma'

/** The two flags {@link isAdmissible} decides on, as RobTop reports them. */
export interface AdmissionFacts {
  isRated: boolean
  isDemon: boolean
}

/**
 * Whether the level cache admits a level: anything but a rated non-demon.
 *
 * @param level - GD's `isRated`/`isDemon` for the level, from a RobTop snapshot.
 */
export function isAdmissible(level: AdmissionFacts): boolean {
  return !level.isRated || level.isDemon
}

/** The user-facing reason a rated non-demon was refused, wherever it surfaces. */
export const NOT_A_DEMON_MESSAGE =
  'Not a demon — InfernoLog tracks demons and unrated levels'

/**
 * The 422 body for a level refused at admission. See
 * `NotADemonResponseSchema` in packages/core.
 *
 * @param levelId - The GD level ID that was looked up.
 * @param level - What GD reported for it.
 */
export function notADemonBody(
  levelId: string,
  level: {
    name: string | null
    creator: string | null
    inGameDifficulty: string | null
  }
): NotADemonResponse {
  return {
    error: NOT_A_DEMON_MESSAGE,
    reason: 'not_a_demon',
    level: {
      inGameId: levelId,
      name: level.name,
      creator: level.creator,
      inGameDifficulty: level.inGameDifficulty,
    },
  }
}

/**
 * Deletes a cached level unless progress or a collection entry references it.
 *
 * For a level that should no longer be cached — an unrated level GD has since
 * rated as a non-demon. One that someone logged or collected in the meantime is
 * kept, like a demoted demon: removing it would take their data with it.
 *
 * Race-safe without a lock. The reference check and the delete are one
 * statement, and a reference inserted concurrently is caught by the foreign key
 * (`Restrict`), which surfaces as P2003 and is treated as "in use".
 *
 * @param levelId - The GD level ID.
 * @returns True if the level was deleted.
 */
export async function purgeIfUnused(levelId: string): Promise<boolean> {
  try {
    const { count } = await prisma.level.deleteMany({
      where: {
        inGameId: levelId,
        levelProgress: { none: {} },
        collectionEntries: { none: {} },
      },
    })
    return count > 0
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2003'
    ) {
      return false
    }
    throw err
  }
}
