// Public (unauthenticated) user routes.
//
// Mounted on /v1 in index.ts BEFORE authMiddleware — the username check runs
// during sign-up, before a User row (or even a confirmed Cognito identity)
// exists, so it must not require auth.
//
// This is also the future home of the planned public-profile reads
// (GET /v1/users/{usernameOrId}) — see docs/API_DESIGN.md.

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { UsernameSchema } from '@infernolog/core'
import prisma from '../utils/prisma'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// GET /v1/users/check-username?username= — availability check for the debounced
// sign-up / settings editor typeahead.
//
// Validates format and reserved names in addition to uniqueness, so the client
// gets the same verdict here that PATCH /v1/me/username would give on submit.
// Checking uniqueness alone would report reserved names like "admin" as
// available and only fail at submit time.
//
// Always 200, including for a missing or malformed username: this answers
// "can I have this name?", and "no, because it's too short" is an answer rather
// than a client error. The frontend renders `error` inline beneath the field.
app.get('/users/check-username', async (c) => {
  const username = c.req.query('username')

  if (!username) {
    return c.json({
      available: false,
      error: 'Username must be at least 2 characters',
    })
  }

  const parsed = UsernameSchema.safeParse(username)
  if (!parsed.success) {
    // `error.message` is a JSON dump of every issue — take the first issue's
    // message, which is the human-readable string attached to the failing rule.
    return c.json({
      available: false,
      error: parsed.error.issues[0]?.message ?? 'Username is not valid',
    })
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    })

    return c.json({ available: !existing })
  } catch (error) {
    console.error('GET /users/check-username error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
