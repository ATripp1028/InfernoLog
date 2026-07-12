// Claims-only routes: these need a verified Cognito identity but must work
// even when no InfernoLog `users` row exists yet (createUserForSignup hasn't
// run, or never will for a rejected sign-in). Mounted in index.ts BEFORE
// `app.use('/v1/*', authMiddleware)`, mirroring the existing public
// check-username route — so they never hit the Prisma-lookup-or-404 the
// normal authMiddleware would apply.

import { Hono } from 'hono'
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
import { logger } from '../utils/logger'
import { getVerifiedClaims } from '../middleware/auth'
import { createUserForSignup } from '../services/user'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

// POST /v1/auth/signup/start — creates the InfernoLog `users` row for a
// confirmed (age-gated) sign-up. Idempotent: a double-submit for the same
// Cognito identity returns the already-created row rather than erroring.
app.post('/auth/signup/start', async (c) => {
  const claims = getVerifiedClaims(c)
  if (!claims?.email) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const user = await createUserForSignup(claims.email, claims.sub)
    return c.json({ data: { id: user.id } }, 200)
  } catch (err) {
    logger.error({ err }, 'POST /auth/signup/start error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/auth/signin/reject — called when a Sign In attempt finds no
// matching InfernoLog user for the just-completed Google OAuth identity.
// Synchronously deletes the Cognito user so no trace of this attempt
// persists anywhere — load-bearing for the COPPA argument that a rejected
// sign-in never retains a would-be user's data. Nothing here (or in the
// app-wide request logger) logs the claims payload itself, only the sub.
app.post('/auth/signin/reject', async (c) => {
  const claims = getVerifiedClaims(c)
  if (!claims) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const existing = await prisma.user.findUnique({
      where: { cognitoSub: claims.sub },
      select: { id: true },
    })
    if (existing) {
      // Frontend only calls this after GET /v1/me 404s — a match here means
      // the two requests raced. Refuse rather than silently deleting a real
      // account's Cognito identity.
      return c.json({ error: 'A matching account exists' }, 400)
    }

    try {
      await cognito.send(
        new AdminDeleteUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: claims.sub,
        })
      )
    } catch (err) {
      // Double-click race: a concurrent reject already deleted this identity.
      if (!(err instanceof UserNotFoundException)) throw err
    }

    logger.info({ sub: claims.sub }, 'Discarded Cognito identity (signin, no matching account)')
    return c.json({ data: { discarded: true } }, 200)
  } catch (err) {
    logger.error({ err }, 'POST /auth/signin/reject error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
