import { Hono } from 'hono'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import * as Sentry from '@sentry/node'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL!,
})

// Reserved usernames
const RESERVED_USERNAMES = ['admin', 'moderator', 'infernolog']

// Username validation schema
const usernameSchema = z
  .string()
  .min(2, 'Username must be at least 2 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  )
  .refine(
    (val:any) => !RESERVED_USERNAMES.includes(val.toLowerCase()),
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
  //console.log('GET /me - userId from auth middleware:', c) // Debug log
  const userId = c.get('userId') as string // this is the Cognito sub

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId }, // look up by id
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

    return c.json({ data: user })
  } catch (error) {
    console.error('GET /me error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  } finally {
    await prisma.$disconnect()
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

    // Check username uniqueness (case insensitive)
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

    return c.json({ data: updated })
  } catch (error) {
    console.error('POST /me/onboarding error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  } finally {
    await prisma.$disconnect()
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