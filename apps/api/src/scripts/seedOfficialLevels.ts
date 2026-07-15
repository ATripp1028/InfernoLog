// Seeds the official Geometry Dash levels into the shared `levels` cache.
//
// Official/main levels aren't served by RobTop's getGJLevels21, so they never
// enter the cache via autofill — this script writes them directly so they
// appear in name search and resolve as cache hits. Idempotent (upsert): safe to
// re-run after correcting data in src/data/officialLevels.ts.
//
// Usage (from apps/api, with DATABASE_URL set in .env):
//   pnpm db:seed:official
//
// dotenv/config must load before utils/prisma (which reads DATABASE_URL at
// import time), so it is the very first import.
import 'dotenv/config'
import prisma from '../utils/prisma'
import { OFFICIAL_LEVELS } from '../data/officialLevels'
import { OFFICIAL_SONGS } from '../utils/robtop'
import { fetchGddlTier } from '../utils/gddl'

async function main() {
  let created = 0
  let updated = 0

  for (const level of OFFICIAL_LEVELS) {
    const song =
      level.officialSongId != null
        ? OFFICIAL_SONGS[level.officialSongId]
        : undefined
    const songName = level.songName ?? song?.name ?? null
    const songAuthor = level.songAuthor ?? song?.author ?? null

    // Matches GET /levels/:levelId/resolve's suggestedGddlTier logic: only
    // meaningful for rated levels, and fetchGddlTier never throws (down/
    // timeout/not-found all resolve to null).
    const gddlTier = level.stars > 0 ? await fetchGddlTier(level.inGameId) : null

    const fields = {
      levelType: 'CLASSIC' as const,
      name: level.name,
      creator: 'RobTop',
      inGameDifficulty: level.inGameDifficulty,
      isDemon: level.isDemon,
      isRated: level.stars > 0,
      stars: level.stars,
      gddlTier,
      length: level.length,
      gameVersion: level.gameVersion,
      coins: level.coins,
      songName,
      songAuthor,
      officialSongId: level.officialSongId,
      // Official levels carry no showcase glow.
      featured: false,
      epicValue: 0,
      dataSource: 'official',
      verified: true,
    }

    const existing = await prisma.level.findUnique({
      where: { inGameId: level.inGameId },
      select: { inGameId: true },
    })

    await prisma.level.upsert({
      where: { inGameId: level.inGameId },
      create: { inGameId: level.inGameId, ...fields },
      update: fields,
    })

    if (existing) updated++
    else created++
  }

  console.log(
    `Official levels seeded: ${created} created, ${updated} updated (${OFFICIAL_LEVELS.length} total).`
  )
}

main()
  .catch((err) => {
    console.error('Failed to seed official levels:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
