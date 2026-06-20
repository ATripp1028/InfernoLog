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
import { PrismaClient } from '@prisma/client'
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

// Tables touched by the logging flow, ordered so CASCADE handles the rest.
const TABLES = [
  'record_acceptances',
  'list_references',
  'rating_scores',
  'progress_updates',
  'level_progress',
  'levels',
  'rating_categories',
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
  }> = {}
) {
  return prisma.level.create({
    data: {
      inGameId: overrides.inGameId ?? '12345',
      name: overrides.name ?? 'Test Level',
      creator: overrides.creator ?? 'Test Creator',
      inGameDifficulty: overrides.inGameDifficulty ?? 'Insane Demon',
      dataSource: overrides.dataSource ?? 'gdbrowser_autofill',
      verified: overrides.verified ?? true,
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
