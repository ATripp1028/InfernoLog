// Shared test helpers.
//
// - buildApp: wraps a route module with a middleware that injects userId/email,
//   mimicking the real auth middleware. Used by BOTH the mocked unit tests
//   (me.test.ts) and the real-DB integration tests.
// - getTestPrisma / truncateAll / seed*: integration-only helpers that talk to
//   a real Postgres (docker-compose.test.yml). Integration tests vi.mock
//   '../utils/prisma' to return getTestPrisma() so handlers hit the real DB.

import { randomUUID } from 'crypto'
import { Hono } from 'hono'
import { PrismaClient, type RatingMode } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import type { HonoVariables } from '../types/hono'

export const TEST_USER_ID = 'user-123'

// Local Postgres for integration tests. Override via TEST_DATABASE_URL.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/infernolog_test'

// Wraps a route app with a middleware that injects the authed user, so route
// tests exercise handler behavior without the real Cognito auth middleware.
export function buildApp(
  routeApp: Hono<{ Variables: HonoVariables }>,
  opts: { userId?: string; userEmail?: string } = {}
) {
  const { userId = TEST_USER_ID, userEmail = 'test@example.com' } = opts
  const app = new Hono<{ Variables: HonoVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', userId)
    c.set('userEmail', userEmail)
    await next()
  })
  app.route('/', routeApp)
  return app
}

// ─────────────────────────────────────────────
// Integration-only: real Postgres helpers
// ─────────────────────────────────────────────

let _prisma: PrismaClient | undefined

// A PrismaClient backed by the node-postgres driver adapter, pointed at the
// local test database. We use a driver adapter (not the native binary engine)
// to match the driverAdapters setup the app uses in production — and because
// the native engine is incompatible with the test runner's Node version. The
// pg adapter talks plain TCP, so no Neon WebSocket proxy is needed locally.
// Reused across integration tests.
export function getTestPrisma(): PrismaClient {
  if (!_prisma) {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL })
    // Cast to the adapter's own expected Pool type: @prisma/adapter-pg and our
    // direct `pg` import can resolve to different @types/pg copies, which are
    // structurally identical but nominally distinct under the type checker.
    const adapter = new PrismaPg(
      pool as unknown as ConstructorParameters<typeof PrismaPg>[0]
    )
    _prisma = new PrismaClient({ adapter })
  }
  return _prisma
}

// Tables truncated between tests. Ordered so TRUNCATE ... CASCADE from `users`
// clears everything that references it — which is every user-owned table EXCEPT
// gddl_sync_jobs: that model declares no relation to User at all (see the
// schema, and the explicit deleteMany it needs in the DELETE /me purge for the
// same reason). Without listing it here its rows survive a truncate and leak
// into the next test.
const TABLES = [
  'rating_scores',
  'classic_demon_list',
  'collection_entries',
  'collections',
  'progress_updates',
  'level_progress',
  'levels',
  'rating_categories',
  'gddl_sync_jobs',
  'users',
]

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  )
}

export async function seedUser(
  prisma: PrismaClient,
  overrides: Partial<{
    id: string
    username: string
    email: string
    gddlApiKeyEncrypted: string | null
    ratingMode: RatingMode
  }> = {}
) {
  const id = overrides.id ?? randomUUID()
  const short = id.slice(0, 8)
  return prisma.user.create({
    data: {
      id,
      username: overrides.username ?? `user_${short}`,
      email: overrides.email ?? `${short}@test.dev`,
      gddlApiKeyEncrypted: overrides.gddlApiKeyEncrypted ?? null,
      // Defaulted by the schema; stated only by specs that care which mode the
      // user is in, which the ranking endpoints very much do.
      ...(overrides.ratingMode ? { ratingMode: overrides.ratingMode } : {}),
    },
  })
}

export async function seedLevel(
  prisma: PrismaClient,
  overrides: Partial<{
    inGameId: string
    name: string
    creator: string
    inGameDifficulty: string
    dataSource: string
    verified: boolean
    isDemon: boolean
    isRated: boolean
    levelType: 'CLASSIC' | 'PLATFORMER'
    isNong: boolean
    sfhCheckedAt: Date
  }> = {}
) {
  return prisma.level.create({
    data: {
      inGameId: overrides.inGameId ?? '12345',
      name: overrides.name ?? 'Test Level',
      creator: overrides.creator ?? 'Test Creator',
      inGameDifficulty: overrides.inGameDifficulty ?? 'Insane Demon',
      dataSource: overrides.dataSource ?? 'robtop_autofill',
      verified: overrides.verified ?? true,
      // Defaults mirror the schema (both false) so existing callers are
      // unaffected; ranking tests opt in with isDemon: true.
      isDemon: overrides.isDemon ?? false,
      isRated: overrides.isRated ?? false,
      levelType: overrides.levelType ?? 'CLASSIC',
      isNong: overrides.isNong ?? false,
      sfhCheckedAt: overrides.sfhCheckedAt ?? null,
    },
  })
}

export async function seedRatingCategory(
  prisma: PrismaClient,
  userId: string,
  name = 'Gameplay',
  sortOrder = 0
) {
  return prisma.ratingCategory.create({
    data: { userId, name, weight: 1, sortOrder },
  })
}
