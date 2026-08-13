// The account itself:
//
//   GET    /v1/me
//   PATCH  /v1/me            — partial update of user preferences
//   PATCH  /v1/me/username   — separate: cooldown + uniqueness semantics
//   DELETE /v1/me            — permanent account purge

import { Hono } from 'hono'
import { z } from 'zod'
import * as Sentry from '@sentry/node'
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider'
import { UpdateMeSchema, UpdateUsernameSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { isUniqueViolation } from '../../middleware/errors'
import { logger } from '../../utils/logger'
import { getVerifiedClaims } from '../../middleware/auth'
import { DEFAULT_RATING_CATEGORIES } from '../../services/user'
import type { HonoVariables } from '../../types/hono'
import {
  meWithCategoriesSelect,
  serializeMe,
  type RawUser,
} from '../../services/user/serialize'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

const USERNAME_COOLDOWN_DAYS = 30
const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

const DELETE_ACCOUNT_CONFIRMATION = 'Delete this account'
const DeleteAccountSchema = z.object({
  confirmation: z.literal(DELETE_ACCOUNT_CONFIRMATION),
})

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

// GET /v1/me
app.get('/me', async (c) => {
  const userId = c.get('userId')

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: meWithCategoriesSelect,
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }
  logger.info({ userId }, 'Fetched user profile')
  return c.json({ data: serializeMe(user as RawUser) })
})

// PATCH /v1/me — partial update of user preferences (Privacy, Logging, Rating mode, etc.)
app.patch('/me', async (c) => {
  const userId = c.get('userId')

  const parsed = await parseJsonBody(c, UpdateMeSchema)
  if (!parsed.ok) return parsed.response

  // Seed default rating categories on first transition to WEIGHTED if the
  // user has none yet. Keeps the invariant that WEIGHTED mode always has
  // at least one category to score against.
  if (parsed.data.ratingMode === 'WEIGHTED') {
    const count = await prisma.ratingCategory.count({ where: { userId } })
    if (count === 0) {
      // skipDuplicates relies on the @@unique([userId, name]) constraint:
      // if two requests race past the count check, the second insert is a
      // silent no-op instead of producing duplicate seed categories.
      await prisma.ratingCategory.createMany({
        data: DEFAULT_RATING_CATEGORIES.map((cat) => ({ userId, ...cat })),
        skipDuplicates: true,
      })
      logger.info({ userId }, 'Seeded default rating categories')
    }
  }

  // acceptLegal isn't a column — it just stamps legalAcceptedAt when true.
  const { acceptLegal, ...rest } = parsed.data
  const data = stripUndefined(rest)
  if (acceptLegal) {
    ;(data as { legalAcceptedAt?: Date }).legalAcceptedAt = new Date()
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: meWithCategoriesSelect,
  })

  logger.info(
    { userId, fields: Object.keys(parsed.data) },
    'Updated user preferences'
  )
  return c.json({ data: serializeMe(updated as RawUser) })
})

// PATCH /v1/me/username — separate route because it has cooldown semantics
// and a uniqueness check.
app.patch('/me/username', async (c) => {
  const userId = c.get('userId')

  const parsed = await parseJsonBody(c, UpdateUsernameSchema)
  if (!parsed.ok) return parsed.response

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

  // The uniqueness pre-check above is TOCTOU; the unique constraint on
  // User.username is the real guarantee. If a concurrent request claimed the
  // name in between, Prisma throws P2002 — surface it as the same 409 the
  // pre-check returns rather than letting it reach onError as a 500.
  let updated
  try {
    updated = await prisma.user.update({
      where: { id: userId },
      data: isSameUsername
        ? { username }
        : {
            username,
            previousUsername,
            usernameChangedAt: new Date(),
          },
      select: meWithCategoriesSelect,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json({ error: 'Username is already taken' }, 409)
    }
    throw error
  }

  logger.info({ userId, previousUsername, username }, 'Username updated')
  return c.json({ data: serializeMe(updated as RawUser) })
})

// DELETE /v1/me — permanently deletes the account and all associated data.
// Requires the confirmation phrase in the body as a defense-in-depth check
// behind the frontend's typed-confirmation modal (belt and suspenders — an
// authorized bearer token alone is not treated as sufficient intent for an
// irreversible delete).
//
// Report/BanAppeal/ModerationAction rows referencing this user are deleted
// explicitly first because their FKs are ON DELETE RESTRICT (an intentional
// audit-trail protection against ordinary moderation cleanup — see
// schema.prisma). No moderation feature reads these tables yet, so a full
// account purge including them is safe for now; revisit if a real audit
// trail requirement lands before that FK behavior changes. GddlSyncJob is
// deleted explicitly too since it has no declared FK/cascade to `users` at
// all. RatingScore.categoryId -> RatingCategory has no onDelete action either,
// so it must be cleared explicitly too: User cascades to both RatingCategory
// and (via LevelProgress -> ProgressUpdate) RatingScore independently, and
// Postgres validates the categoryId FK before the RatingScore side of that
// cascade is guaranteed to have run, throwing P2003 otherwise. Everything
// else (LevelProgress, ProgressUpdate, ClassicRanking,
// Collection, ApiKey, RatingCategory, ListPreset, ImportJob, ...) cascades
// from the `users` delete.
app.delete('/me', async (c) => {
  const userId = c.get('userId')

  const parsed = await parseJsonBody(c, DeleteAccountSchema, {
    invalidMessage: 'Confirmation text does not match',
  })
  if (!parsed.ok) return parsed.response

  await prisma.$transaction([
    prisma.report.deleteMany({
      where: { OR: [{ reporterId: userId }, { reportedUserId: userId }] },
    }),
    prisma.banAppeal.deleteMany({ where: { userId } }),
    prisma.moderationAction.deleteMany({
      where: { OR: [{ moderatorId: userId }, { targetUserId: userId }] },
    }),
    prisma.gddlSyncJob.deleteMany({ where: { userId } }),
    prisma.ratingScore.deleteMany({
      where: { levelProgress: { userId } },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ])

  // Best-effort — the InfernoLog account is already gone at this point
  // regardless of whether this succeeds. A leftover Cognito identity just
  // means the user gets a fresh account if they sign back in.
  const claims = getVerifiedClaims(c)
  if (claims) {
    try {
      await cognito.send(
        new AdminDeleteUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: claims.sub,
        })
      )
    } catch (err) {
      if (!(err instanceof UserNotFoundException)) {
        logger.error(
          { userId, err },
          'Failed to delete Cognito identity after account deletion'
        )
        Sentry.captureException(err)
      }
    }
  }

  logger.info({ userId }, 'Account deleted')
  return c.json({ data: { deleted: true } })
})

export default app
