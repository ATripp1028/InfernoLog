// Resets the dedicated E2E user to a known state. Called by Playwright's
// globalSetup (apps/web/e2e/globalSetup.ts) once per run — see
// docs/E2E_TESTING.md.
//
// Reset BEFORE a run, never after: a crashed run should leave its evidence in
// the database for debugging, and the next run cleans up regardless.
//
// The staging database is shared and long-lived, so this only ever touches
// rows owned by the E2E user. Levels are global and are checked, not written.
//
// Usage (from apps/api, with DATABASE_URL pointing at the target stage):
//   E2E_STAGE=staging E2E_USER_EMAIL=e2e+staging@… pnpm e2e:reset
//
// dotenv/config must load before utils/prisma (which reads DATABASE_URL at
// import time), so it is the very first import.
import 'dotenv/config'
import prisma from '../utils/prisma'
import {
  DEFAULT_COLLECTIONS,
  DEFAULT_RATING_CATEGORIES,
} from '../services/user'
import {
  E2E_LEVEL_IDS,
  assertNotProduction,
  describeDatabaseUrl,
  requireE2eEmail,
} from './e2eFixtures'

/**
 * Deletes every row the E2E user owns and restores the baseline the specs
 * start from: built-in collections present, no progress, no ranking, no custom
 * collections, the default rating categories, default preferences, onboarding
 * complete.
 *
 * Specs create whatever else they need, which is what lets them run in any
 * order — the reset happens once per run, not once per spec.
 */
export async function resetE2eUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (!user) {
    throw new Error(
      `No users row for ${email}. Run \`pnpm e2e:provision\` against this stage first.`
    )
  }
  const userId = user.id

  await assertFixtureLevelsPresent()

  // Everything hanging off LevelProgress (ProgressUpdate, ClassicRanking,
  // RatingScore) cascades from its delete; the rest is keyed on the user
  // directly. RatingScore is nevertheless cleared first and explicitly,
  // because its categoryId -> RatingCategory relation has no onDelete action:
  // resetPreferences below re-seeds the rating categories, and that delete is
  // rejected while any rating_scores row still points at one. (The
  // account-deletion path in routes/account/profile.ts does the same thing
  // for the same FK, reached via user.delete's cascade.)
  await prisma.$transaction([
    prisma.ratingScore.deleteMany({ where: { levelProgress: { userId } } }),
    prisma.levelProgress.deleteMany({ where: { userId } }),
    prisma.collectionEntry.deleteMany({ where: { collection: { userId } } }),
    prisma.collection.deleteMany({ where: { userId, type: 'CUSTOM' } }),
    prisma.importJob.deleteMany({ where: { userId } }),
    prisma.listPreset.deleteMany({ where: { userId } }),
    prisma.gddlSyncJob.deleteMany({ where: { userId } }),
    prisma.apiKey.deleteMany({ where: { userId } }),
  ])

  await seedBuiltInCollections(userId)
  await resetPreferences(userId)

  return userId
}

/**
 * Fails loudly when a fixture level is missing from the shared `levels` cache.
 *
 * The suite deliberately logs against official levels so it never depends on
 * RobTop's servers, but that only holds if they were seeded on this stage.
 */
async function assertFixtureLevelsPresent() {
  const present = await prisma.level.findMany({
    where: { inGameId: { in: E2E_LEVEL_IDS } },
    select: { inGameId: true },
  })
  const missing = E2E_LEVEL_IDS.filter(
    (id) => !present.some((l) => l.inGameId === id)
  )
  if (missing.length > 0) {
    throw new Error(
      `Fixture levels missing from the levels cache: ${missing.join(', ')}. ` +
        'Run `pnpm db:seed:official` against this stage.'
    )
  }
}

/**
 * Recreates any built-in collection the user is missing, leaving existing ones
 * (and their IDs) alone. Custom collections were dropped by the reset above.
 */
async function seedBuiltInCollections(userId: string) {
  const existing = await prisma.collection.findMany({
    where: { userId },
    select: { type: true },
  })
  const missing = DEFAULT_COLLECTIONS.filter(
    (c) => !existing.some((e) => e.type === c.type)
  )
  if (missing.length === 0) return
  await prisma.collection.createMany({
    data: missing.map((c) => ({ ...c, userId })),
  })
}

/**
 * Puts every preference a spec might toggle back to its default, so a spec
 * that changes one (rating scale, FPS, date format) cannot leak into the next
 * run. Onboarding is forced complete: the suite starts inside the app, and the
 * onboarding flow is covered by component tests.
 *
 * The GDDL key is cleared for a sharper reason than tidiness: `hasGddlApiKey`
 * is what routes the completion wizard through its `c_gddl` step
 * (CompletionReviewStep). A key left connected silently adds a step, and every
 * spec that walks the wizard breaks on a screen it never expected.
 *
 * The rating categories go back to the defaults alongside the scalar fields,
 * not as tidiness either: enabling enjoyment renormalizes the category weights
 * so that they plus `enjoymentWeight` sum to 1.00 (see schema.prisma on
 * RatingCategory.weight). Zeroing `enjoymentWeight` without restoring the
 * categories would leave every later run with weights summing to less than
 * 1.00, quietly skewing every weighted average the suite reads.
 */
async function resetPreferences(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingCompleted: true,
      legalAcceptedAt: new Date(),
      gddlApiKeyEncrypted: null,
      gddlUsername: null,
      ratingMode: 'SIMPLE',
      ratingDisplayScale: 'ZERO_TO_TEN',
      dateFormatPreference: 'MDY',
      defaultFps: 60,
      defaultPercentageVersion: 'TWO_TWO',
      defaultDevice: 'pc',
      includeEnjoyment: false,
      enjoymentWeight: 0,
      enjoymentSortOrder: 99,
      showHighlightUrl: false,
      autoExpandFabLabels: true,
      timeMachineTopN: 10,
      profilePublic: true,
      discordPublic: true,
      accountStatus: 'ACTIVE',
    },
  })

  // Safe in this order only because the transaction above already removed
  // every RatingScore the user owns — rating_scores.categoryId is a Restrict
  // FK, so a leftover score would reject the delete.
  await prisma.ratingCategory.deleteMany({ where: { userId } })
  await prisma.ratingCategory.createMany({
    data: DEFAULT_RATING_CATEGORIES.map((c) => ({ ...c, userId })),
  })
}

async function main() {
  const stage = assertNotProduction(process.env.E2E_STAGE)
  const email = requireE2eEmail()

  // Printed before connecting, not after: this is the line that tells you
  // which database a connection failure was against.
  console.log(
    `Resetting ${email} on stage ${stage} via ${describeDatabaseUrl(process.env.DATABASE_URL)}`
  )

  const userId = await resetE2eUser(email)
  console.log(`Reset E2E user ${email} (${userId}).`)
}

main()
  .catch((err) => {
    console.error('Failed to reset the E2E user:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
