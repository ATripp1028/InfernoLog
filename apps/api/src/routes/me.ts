import { Hono } from 'hono'
import prisma from '../utils/prisma'
import { z } from 'zod'
import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger'
import { verifyDiscordLinkToken } from './auth'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

const RESERVED_USERNAMES = ['admin', 'moderator', 'infernolog']

const usernameSchema = z
  .string()
  .min(2, 'Username must be at least 2 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  )
  .refine(
    (val: any) => !RESERVED_USERNAMES.includes(val.toLowerCase()),
    'This username is reserved'
  )

const onboardingSchema = z.object({
  username: usernameSchema,
  dateFormatPreference: z.enum(['MDY', 'DMY', 'YMD', 'ISO']),
  ratingMode: z.enum(['SIMPLE', 'WEIGHTED']),
  ratingDisplayScale: z.enum(['ZERO_TO_TEN', 'ZERO_TO_HUNDRED']),
})

// GET /v1/me
app.get('/me', async (c) => {
  const userId = c.get('userId') as string

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        profilePublic: true,
        discordPublic: true,
        ratingMode: true,
        ratingDisplayScale: true,
        dateFormatPreference: true,
        includeEnjoyment: true,
        enjoymentWeight: true,
        onboardingCompleted: true,
        isVerified: true,
        createdAt: true,
      },
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    logger.info({ userId }, 'Fetched user profile')
    return c.json({ data: user })
  } catch (error) {
    console.error('GET /me error:', error)
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

    logger.info({ userId }, 'Completed onboarding')

    return c.json({ data: updated })
  } catch (error) {
    console.error('POST /me/onboarding error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/link-discord
// Called by the frontend after a user signs in with Google in response to
// a Discord email-collision redirect. Confirms ownership of BOTH accounts
// before writing the link.
app.post('/me/link-discord', async (c) => {
  const userId = c.get('userId') as string
  const userEmail = c.get('userEmail') as string

  try {
    const body = await c.req.json().catch(() => null) as { token?: unknown } | null
    if (!body || typeof body.token !== 'string') {
      return c.json({ error: 'Missing token' }, 400)
    }

    const payload = verifyDiscordLinkToken(body.token)
    if (!payload) return c.json({ error: 'Invalid or expired link token' }, 400)

    // Token email must match the email of the user who is currently signed
    // in. This is what makes the linking safe: the link token proves Discord
    // ownership, the Cognito JWT proves Google ownership, and the email match
    // ensures both halves describe the same identity.
    if (payload.email.toLowerCase() !== userEmail.toLowerCase()) {
      logger.warn({ userId, tokenEmail: payload.email }, 'Link token email mismatch')
      return c.json({ error: 'Email does not match the signed-in account' }, 403)
    }

    // Refuse to overwrite an existing different linkage.
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordId: true },
    })
    if (existing?.discordId && existing.discordId !== payload.discordId) {
      return c.json({ error: 'Account already has a different Discord linked' }, 409)
    }

    // Also refuse if the Discord ID is already attached to a different user.
    const owner = await prisma.user.findUnique({
      where: { discordId: payload.discordId },
      select: { id: true },
    })
    if (owner && owner.id !== userId) {
      return c.json({ error: 'This Discord account is linked to a different user' }, 409)
    }

    await prisma.user.update({
      where: { id: userId },
      data: { discordId: payload.discordId },
    })

    logger.info({ userId, discordId: payload.discordId }, 'Linked Discord to account')
    return c.json({ data: { linked: true } })
  } catch (error) {
    console.error('POST /me/link-discord error:', error)
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

  const parsed = usernameSchema.safeParse(username)
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

export default app