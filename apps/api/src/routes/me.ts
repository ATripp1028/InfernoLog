import { Hono } from 'hono'
import { randomBytes } from 'crypto'
import prisma from '../utils/prisma'
import { z } from 'zod'
import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger'
import { mintConnectDiscordState } from './auth'
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
        discordId: true,
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