import { Hono } from 'hono'
import { randomBytes } from 'crypto'
import prisma from '../utils/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger'
import { mintConnectDiscordState } from './auth'
import type { HonoVariables } from '../types/hono'
// NOTE: @infernolog/core uses zod 3 while this app uses zod 4. We import the
// schemas at runtime (the API surface matches) but redefine the username
// schema locally so that the inferred types compose cleanly with the local
// zod 4 schemas (mixing instances across major versions breaks inference).
import {
  UpdateMeSchema,
  UpdateUsernameSchema,
  ListPriorityOrderSchema,
  RatingConfigSchema,
  RATING_WEIGHT_SUM_TARGET,
  RATING_WEIGHT_SUM_TOLERANCE,
} from '@infernolog/core'

const app = new Hono<{ Variables: HonoVariables }>()

const USERNAME_COOLDOWN_DAYS = 30
const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

// Strip keys whose value is `undefined`. tsconfig has exactOptionalPropertyTypes,
// so Prisma's update inputs do not accept explicit `undefined` for optional fields.
function stripUndefined<T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> }
}

const RESERVED_USERNAMES = ['admin', 'moderator', 'infernolog']

const localUsernameSchema = z
  .string()
  .min(2, 'Username must be at least 2 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  )
  .refine(
    (val) => !RESERVED_USERNAMES.includes(val.toLowerCase()),
    'This username is reserved'
  )

const onboardingSchema = z.object({
  username: localUsernameSchema,
  dateFormatPreference: z.enum(['MDY', 'DMY', 'YMD', 'ISO']),
  ratingMode: z.enum(['SIMPLE', 'WEIGHTED']),
  ratingDisplayScale: z.enum(['ZERO_TO_TEN', 'ZERO_TO_HUNDRED']),
})

const meSelect = {
  id: true,
  username: true,
  usernameChangedAt: true,
  email: true,
  discordId: true,
  profilePublic: true,
  discordPublic: true,
  ratingMode: true,
  ratingDisplayScale: true,
  dateFormatPreference: true,
  includeEnjoyment: true,
  enjoymentWeight: true,
  listPriorityOrder: true,
  onboardingCompleted: true,
  isVerified: true,
  createdAt: true,
} as const

type RawUser = {
  enjoymentWeight: { toNumber(): number } | number
  ratingCategories?: Array<{
    id: string
    name: string
    weight: { toNumber(): number } | number
    sortOrder: number
  }>
  [key: string]: unknown
}

// Prisma returns Decimal as a Decimal instance; the wire shape uses plain numbers.
function serializeMe(user: RawUser) {
  const { enjoymentWeight, ratingCategories, ...rest } = user
  return {
    ...rest,
    enjoymentWeight:
      typeof enjoymentWeight === 'number'
        ? enjoymentWeight
        : enjoymentWeight.toNumber(),
    ratingCategories: (ratingCategories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      weight: typeof c.weight === 'number' ? c.weight : c.weight.toNumber(),
    })),
  }
}

// GET /v1/me
app.get('/me', async (c) => {
  const userId = c.get('userId') as string

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: {
        ...meSelect,
        ratingCategories: {
          select: { id: true, name: true, weight: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    logger.info({ userId }, 'Fetched user profile')
    return c.json({ data: serializeMe(user as RawUser) })
  } catch (error) {
    console.error('GET /me error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PATCH /v1/me — partial update of user preferences (Privacy, Logging, Rating mode, etc.)
app.patch('/me', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json()
    const parsed = UpdateMeSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    // Seed default rating categories on first transition to WEIGHTED if the
    // user has none yet. Keeps the invariant that WEIGHTED mode always has
    // at least one category to score against.
    if (parsed.data.ratingMode === 'WEIGHTED') {
      const count = await prisma.ratingCategory.count({ where: { userId } })
      if (count === 0) {
        // skipDuplicates relies on the @@unique([userId, name]) constraint:
        // if two requests race past the count check, the second insert is a
        // silent no-op instead of producing duplicate seed categories.
        // Weights are normalized so the three sum to exactly 1.0000 — the
        // last gets the rounding remainder so users start in a valid state.
        await prisma.ratingCategory.createMany({
          data: [
            { userId, name: 'Gameplay', weight: 0.3333, sortOrder: 0 },
            { userId, name: 'Decoration', weight: 0.3333, sortOrder: 1 },
            { userId, name: 'Song', weight: 0.3334, sortOrder: 2 },
          ],
          skipDuplicates: true,
        })
        logger.info({ userId }, 'Seeded default rating categories')
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: stripUndefined(parsed.data),
      select: {
        ...meSelect,
        ratingCategories: {
          select: { id: true, name: true, weight: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    logger.info(
      { userId, fields: Object.keys(parsed.data) },
      'Updated user preferences'
    )
    return c.json({ data: serializeMe(updated as RawUser) })
  } catch (error) {
    console.error('PATCH /me error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PATCH /v1/me/username — separate route because it has cooldown semantics
// and a uniqueness check.
app.patch('/me/username', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json()
    const parsed = UpdateUsernameSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const { username } = parsed.data

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, usernameChangedAt: true },
    })
    if (!current) return c.json({ error: 'User not found' }, 404)

    // Cooldown check — skip if the new username is identical (idempotent no-op).
    if (current.username !== username && current.usernameChangedAt) {
      const elapsed = Date.now() - current.usernameChangedAt.getTime()
      if (elapsed < USERNAME_COOLDOWN_MS) {
        const nextAllowedAt = new Date(
          current.usernameChangedAt.getTime() + USERNAME_COOLDOWN_MS
        )
        return c.json(
          {
            error: 'cooldown',
            nextAllowedAt: nextAllowedAt.toISOString(),
          },
          403
        )
      }
    }

    // Uniqueness check (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        NOT: { id: userId },
      },
      select: { id: true },
    })
    if (existing) {
      return c.json({ error: 'Username is already taken' }, 409)
    }

    const previousUsername = current.username
    const isSameUsername = previousUsername === username

    const updated = await prisma.user.update({
      where: { id: userId },
      data: isSameUsername
        ? { username }
        : {
            username,
            previousUsername,
            usernameChangedAt: new Date(),
          },
      select: {
        ...meSelect,
        ratingCategories: {
          select: { id: true, name: true, weight: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    logger.info({ userId, previousUsername, username }, 'Username updated')
    return c.json({ data: serializeMe(updated as RawUser) })
  } catch (error) {
    // The pre-check above is TOCTOU; the unique constraint on User.username
    // is the real guarantee. If a concurrent request claimed the name in
    // the window between findFirst and update, Prisma throws P2002 — surface
    // that as the same 409 the pre-check returns rather than a generic 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return c.json({ error: 'Username is already taken' }, 409)
    }
    console.error('PATCH /me/username error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PATCH /v1/me/list-priority — reorder the list source priority array
app.patch('/me/list-priority', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json()
    const parsed = ListPriorityOrderSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { listPriorityOrder: parsed.data.order },
      select: {
        ...meSelect,
        ratingCategories: {
          select: { id: true, name: true, weight: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    logger.info({ userId }, 'Updated list priority order')
    return c.json({ data: serializeMe(updated as RawUser) })
  } catch (error) {
    console.error('PATCH /me/list-priority error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/onboarding
app.post('/me/onboarding', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json()
    const parsed = onboardingSchema.safeParse(body)

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const { username, dateFormatPreference, ratingMode, ratingDisplayScale } =
      parsed.data

    const existing = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        NOT: { id: userId },
      },
    })

    if (existing) {
      return c.json({ error: 'Username is already taken' }, 409)
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        dateFormatPreference,
        ratingMode,
        ratingDisplayScale,
        onboardingCompleted: true,
      },
      select: {
        id: true,
        username: true,
        onboardingCompleted: true,
      },
    })

    // Seed default rating categories if the user is starting in WEIGHTED mode.
    if (ratingMode === 'WEIGHTED') {
      const count = await prisma.ratingCategory.count({ where: { userId } })
      if (count === 0) {
        // skipDuplicates relies on the @@unique([userId, name]) constraint:
        // if two requests race past the count check, the second insert is a
        // silent no-op instead of producing duplicate seed categories.
        // Weights are normalized so the three sum to exactly 1.0000 — the
        // last gets the rounding remainder so users start in a valid state.
        await prisma.ratingCategory.createMany({
          data: [
            { userId, name: 'Gameplay', weight: 0.3333, sortOrder: 0 },
            { userId, name: 'Decoration', weight: 0.3333, sortOrder: 1 },
            { userId, name: 'Song', weight: 0.3334, sortOrder: 2 },
          ],
          skipDuplicates: true,
        })
      }
    }

    logger.info({ userId }, 'Completed onboarding')

    return c.json({ data: updated })
  } catch (error) {
    console.error('POST /me/onboarding error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/connect-discord
// Returns a Discord OAuth URL with a signed state encoding the signed-in
// user's id. The browser navigates to that URL; Discord redirects back to the
// public callback in auth.ts, which validates the state and writes discordId.
app.post('/me/connect-discord', async (c) => {
  const userId = c.get('userId') as string

  try {
    const nonce = randomBytes(16).toString('hex')
    const state = mintConnectDiscordState(userId, nonce)

    const authUrl = new URL('https://discord.com/api/oauth2/authorize')
    authUrl.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID!)
    authUrl.searchParams.set('redirect_uri', process.env.DISCORD_REDIRECT_URI!)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'identify email')
    authUrl.searchParams.set('state', state)

    return c.json({ data: { url: authUrl.toString() } })
  } catch (error) {
    console.error('POST /me/connect-discord error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /v1/me/connect-discord
app.delete('/me/connect-discord', async (c) => {
  const userId = c.get('userId') as string

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { discordId: null },
    })
    logger.info({ userId }, 'Disconnected Discord from account')
    return c.json({ data: { disconnected: true } })
  } catch (error) {
    console.error('DELETE /me/connect-discord error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/users/check-username
app.get('/users/check-username', async (c) => {
  const username = c.req.query('username')

  if (!username) {
    return c.json({ error: 'Username is required' }, 400)
  }

  const parsed = localUsernameSchema.safeParse(username)
  if (!parsed.success) {
    return c.json({
      available: false,
      error: parsed.error.message,
    })
  }

  const existing = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: 'insensitive' },
    },
  })

  return c.json({ available: !existing })
})

// ─────────────────────────────────────────────
// RATING CATEGORIES (weighted mode)
// ─────────────────────────────────────────────

function serializeCategory(c: {
  id: string
  name: string
  weight: { toNumber(): number } | number
  sortOrder: number
}) {
  return {
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    weight: typeof c.weight === 'number' ? c.weight : c.weight.toNumber(),
  }
}

// GET /v1/me/rating-categories
app.get('/me/rating-categories', async (c) => {
  const userId = c.get('userId') as string

  try {
    const cats = await prisma.ratingCategory.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, weight: true, sortOrder: true },
    })
    return c.json({ data: cats.map(serializeCategory) })
  } catch (error) {
    console.error('GET /me/rating-categories error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PUT /v1/me/rating-config
// Atomically replaces a user's weighted-rating configuration in a single
// transaction. Granular per-category endpoints were removed because the
// sum-must-equal-1.0 invariant makes single-row mutations impossible to
// validate in isolation — you can't change one weight without changing
// another. The editor submits the full config; the server diffs it against
// existing rows and applies create/update/delete in one transaction.
app.put('/me/rating-config', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json()
    const parsed = RatingConfigSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const { categories, includeEnjoyment, enjoymentWeight } = parsed.data

    // Defensive: RatingConfigSchema already validates the sum, but we
    // recheck server-side in case the schema is ever loosened. Floating-
    // point tolerance must match the schema's so a valid body never trips
    // this guard.
    const sum =
      categories.reduce((acc, cat) => acc + cat.weight, 0) +
      (includeEnjoyment ? enjoymentWeight : 0)
    if (
      Math.abs(sum - RATING_WEIGHT_SUM_TARGET) > RATING_WEIGHT_SUM_TOLERANCE
    ) {
      return c.json(
        {
          error: `Active weights must sum to ${RATING_WEIGHT_SUM_TARGET.toFixed(4)} (got ${sum.toFixed(4)})`,
        },
        400
      )
    }

    const existing = await prisma.ratingCategory.findMany({
      where: { userId },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((r) => r.id))
    const bodyIds = new Set(
      categories.filter((c) => c.id).map((c) => c.id as string)
    )

    // Validate that every id in the body belongs to this user. Reject the
    // whole request rather than silently dropping unknown ids.
    for (const id of bodyIds) {
      if (!existingIds.has(id)) {
        return c.json({ error: `Category ${id} not found` }, 404)
      }
    }

    const toDelete = [...existingIds].filter((id) => !bodyIds.has(id))

    // Two-phase sortOrder write — first park existing rows at negative
    // indices, then rewrite to final positions. Keeps the door open for a
    // future @@unique([userId, sortOrder]) constraint without churn here.
    // sortOrder is the row's position in the body array regardless of
    // whether it's a create or an update.
    const updates: Array<{
      id: string
      name: string
      weight: number
      sortOrder: number
    }> = []
    const creates: Array<{ name: string; weight: number; sortOrder: number }> =
      []
    categories.forEach((c, idx) => {
      if (c.id) {
        updates.push({
          id: c.id,
          name: c.name,
          weight: c.weight,
          sortOrder: idx,
        })
      } else {
        creates.push({ name: c.name, weight: c.weight, sortOrder: idx })
      }
    })

    await prisma.$transaction([
      ...(toDelete.length > 0
        ? [
            prisma.ratingCategory.deleteMany({
              where: { userId, id: { in: toDelete } },
            }),
          ]
        : []),
      // Phase 1: park existing rows at negative sortOrder so phase 2 can
      // freely write the final indices without collisions.
      ...updates.map((u, idx) =>
        prisma.ratingCategory.update({
          where: { id: u.id },
          data: { sortOrder: -(idx + 1) },
        })
      ),
      // Phase 2: write final state for updates.
      ...updates.map((u) =>
        prisma.ratingCategory.update({
          where: { id: u.id },
          data: { name: u.name, weight: u.weight, sortOrder: u.sortOrder },
        })
      ),
      // Creates.
      ...creates.map((c) =>
        prisma.ratingCategory.create({
          data: {
            userId,
            name: c.name,
            weight: c.weight,
            sortOrder: c.sortOrder,
          },
        })
      ),
      prisma.user.update({
        where: { id: userId },
        data: { includeEnjoyment, enjoymentWeight },
      }),
    ])

    const me = await prisma.user.findFirst({
      where: { id: userId },
      select: {
        ...meSelect,
        ratingCategories: {
          select: { id: true, name: true, weight: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    logger.info({ userId }, 'Updated rating config')
    return c.json({ data: serializeMe(me as RawUser) })
  } catch (error) {
    // The @@unique([userId, name]) constraint catches duplicate names that
    // slipped past the zod check (e.g. via direct API hit). Surface as 409.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return c.json({ error: 'Category names must be unique' }, 409)
    }
    console.error('PUT /me/rating-config error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
