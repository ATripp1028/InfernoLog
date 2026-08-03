// GD-server name-search escalation (opt-in, on explicit confirm only). Runs a
// single unfiltered getGJLevels21 name query, drops levels already in the
// cache, partitions the survivors into rated/unrated, and seeds the rated ones
// automatically (data_source=robtop_autofill — same trustworthiness as any
// other autofill, so no seeded-vs-logged distinction is stored). Unrated
// survivors are returned but NOT seeded; the client seeds one only if the user
// selects it (by navigating to its Global Level Page, which resolves+caches on
// the miss). See the SpecNote decision record for the locked reasoning.

import type { LevelSearchResult } from '@infernolog/core'
import prisma from '../utils/prisma'
import { searchRobtopByNameResult, type RobtopLevel } from '../utils/robtop'
import { buildRobtopCreateData } from './levelResolve'

export type GdSearchOutcome =
  // The call succeeded and at least one not-already-cached level survived.
  | { status: 'ok'; rated: LevelSearchResult[]; unrated: LevelSearchResult[] }
  // The call succeeded but every result was already in the cache (or GD found
  // nothing). Distinct from a failure — the user consented to a network call
  // and it worked; there is just nothing new. `totalFound` is the pre-dedupe
  // count so the client can say "all N are already cached".
  | { status: 'nothing_new'; totalFound: number }
  // The RobTop call itself couldn't complete — retryable.
  | { status: 'unreachable' }

// Maps a parsed RobTop level to the same row shape the cache search returns, so
// result rows render identically regardless of source.
function toRow(inGameId: string, level: RobtopLevel): LevelSearchResult {
  return {
    inGameId,
    name: level.name,
    creator: level.creator,
    songName: level.songName,
    inGameDifficulty: level.inGameDifficulty,
    stars: level.stars,
    featured: level.featured,
    epicValue: level.epicValue,
    isRated: level.isRated,
  }
}

export async function runGdSearch(q: string): Promise<GdSearchOutcome> {
  const outcome = await searchRobtopByNameResult(q)
  if (outcome.status === 'unreachable') return { status: 'unreachable' }

  const results = outcome.results
  const totalFound = results.length
  if (totalFound === 0) return { status: 'nothing_new', totalFound: 0 }

  // Drop anything already in the cache — those levels were already shown from
  // the cache results above; repeating them would encourage escalating for
  // levels we already hold.
  const ids = results.map((r) => r.levelId)
  const cached = await prisma.level.findMany({
    where: { inGameId: { in: ids } },
    select: { inGameId: true },
  })
  const cachedIds = new Set(cached.map((c) => c.inGameId))
  const survivors = results.filter((r) => !cachedIds.has(r.levelId))

  if (survivors.length === 0) return { status: 'nothing_new', totalFound }

  const rated = survivors.filter((r) => r.level.isRated)
  const unrated = survivors.filter((r) => !r.level.isRated)

  // Seed rated survivors automatically. Data is already in hand from the search
  // response — no extra RobTop calls. upsert (not create) guards against a
  // concurrent seed of the same id; the empty update keeps the existing row.
  await Promise.all(
    rated.map((r) =>
      prisma.level.upsert({
        where: { inGameId: r.levelId },
        create: buildRobtopCreateData(r.levelId, r.level),
        update: {},
      })
    )
  )

  return {
    status: 'ok',
    rated: rated.map((r) => toRow(r.levelId, r.level)),
    unrated: unrated.map((r) => toRow(r.levelId, r.level)),
  }
}
