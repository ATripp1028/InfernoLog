// Seeds the end-to-end suite's fixture levels into a stage's `levels` cache.
//
// The suite logs against levels that are never fetched from RobTop, so a run
// can't be broken by GD's servers being unreachable. Those used to be the
// official levels; all but three of them are non-demons, which the cache no
// longer admits, so the suite has its own fixtures instead (see
// scripts/e2eFixtures.ts).
//
// ⚠️ THESE ROWS MUST NEVER EXIST IN PRODUCTION. Three things keep them out:
// this script refuses to run against it, their ids sit above every real GD
// level id so they can never collide with a real level, and they carry
// `dataSource = 'e2e_fixture'` so any that turn up somewhere they shouldn't can
// be found — and deleted — with one query.
//
// Idempotent (upsert): safe to re-run after editing the fixture list.
//
// Usage (from apps/api):
//   E2E_STAGE=staging DATABASE_URL=… pnpm db:seed:e2e
//
// dotenv/config must load before utils/prisma (which reads DATABASE_URL at
// import time), so it is the very first import.
import 'dotenv/config'
import prisma from '../utils/prisma'
import { DATA_SOURCE_E2E_FIXTURE } from '../data/dataSources'
import {
  assertNotProduction,
  describeDatabaseUrl,
  E2E_CREATOR,
  E2E_SEED_LEVELS,
} from './e2eFixtures'

async function main() {
  const stage = assertNotProduction(process.env.E2E_STAGE)
  console.log(
    `Seeding ${E2E_SEED_LEVELS.length} E2E fixture level(s) into stage "${stage}" ` +
      `(${describeDatabaseUrl(process.env.DATABASE_URL)})`
  )

  let created = 0
  let updated = 0

  for (const level of E2E_SEED_LEVELS) {
    const fields = {
      levelType: 'CLASSIC' as const,
      name: level.name,
      creator: E2E_CREATOR,
      inGameDifficulty: level.inGameDifficulty,
      // Every fixture is a rated demon: the only thing the suite can log.
      isDemon: true,
      isRated: true,
      // The machine-readable token the difficulty filter and sort key on.
      partialDiff: `demon-${level.inGameDifficulty.split(' ')[0]!.toLowerCase()}`,
      length: 'Long',
      coins: level.coins,
      coinsVerified: level.coins > 0,
      // No downloads or likes, deliberately: the /search spec sorts by
      // downloads to exercise the keyset cursor's TIE arm, which needs every
      // fixture to collapse to the same sort value.
      gameVersion: '2.2',
      // No showcase glow — nothing in the suite asserts one.
      featured: false,
      epicValue: 0,
      dataSource: DATA_SOURCE_E2E_FIXTURE,
      // Verified so the sync's repair path would leave them alone even if
      // something ever did feed one to it.
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
    `E2E fixture levels seeded: ${created} created, ${updated} updated.`
  )
}

main()
  .catch((err) => {
    console.error('Failed to seed E2E fixture levels:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
