// Weighted-mode rating configuration:
//
//   GET /v1/me/rating-categories
//   PUT /v1/me/rating-config
//
// Ratings are stored as integers 0–100 internally regardless of
// user.ratingDisplayScale; conversion happens at the display layer.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/node'
import {
  RatingConfigSchema,
  RATING_WEIGHT_SUM_TARGET_CENTS,
} from '@infernolog/core'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import {
  meWithCategoriesSelect,
  serializeMe,
  type RawUser,
} from '../../services/user/serialize'

const app = new Hono<{ Variables: HonoVariables }>()

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

    const {
      categories,
      includeEnjoyment,
      enjoymentWeight,
      enjoymentSortOrder,
    } = parsed.data

    // Defensive — RatingConfigSchema already validates this with the same
    // integer-cents math, but we recheck here in case the schema is ever
    // loosened. Integer math avoids floating-point tolerance entirely.
    const cents =
      categories.reduce((acc, cat) => acc + Math.round(cat.weight * 100), 0) +
      (includeEnjoyment ? Math.round(enjoymentWeight * 100) : 0)
    if (cents !== RATING_WEIGHT_SUM_TARGET_CENTS) {
      return c.json(
        {
          error: `Active weights must sum to 1.00 (got ${(cents / 100).toFixed(2)})`,
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
            prisma.ratingScore.deleteMany({
              where: { categoryId: { in: toDelete } },
            }),
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
        data: { includeEnjoyment, enjoymentWeight, enjoymentSortOrder },
      }),
    ])

    const me = await prisma.user.findFirst({
      where: { id: userId },
      select: meWithCategoriesSelect,
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
