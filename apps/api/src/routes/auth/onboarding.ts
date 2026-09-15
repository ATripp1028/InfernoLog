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
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import { getVerifiedClaims } from '../../middleware/auth'
import { createErrorHandler } from '../../middleware/errors'
import { AuthErrorCode } from '@infernolog/core'
import { SignupEmailTakenError, createUserForSignup } from '../../services/user'
import {
  isEmailVerified,
  signupProviderFromClaims,
} from '../../utils/identityClaims'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(createErrorHandler('Onboarding'))

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

// POST /v1/auth/signup/start — creates the InfernoLog `users` row for a
// confirmed (age-gated) sign-up, for either sign-in method: a Google identity
// straight from OAuth, or a native Cognito user the browser just signed in with
// after POST /v1/auth/password-signup/verify created it.
//
// Idempotent on the identity: a double-submit for the same Cognito identity
// returns the already-created row rather than erroring — which also covers an
// identity that already has an InfernoLog account going through Sign Up by
// mistake. Either way, the frontend needs onboardingCompleted in the response
// to know whether to route into the wizard or straight into the app.
//
// Refuses a token whose email isn't verified: User.email is unique, so an
// account created on an unproven address would let anyone hold someone else's.
// A DIFFERENT identity arriving with an email another account already has is
// refused too, and its Cognito user is discarded like a rejected sign-in's —
// accounts are never merged or attached by email.
app.post('/auth/signup/start', async (c) => {
  const claims = getVerifiedClaims(c)
  if (!claims?.email) return c.json({ error: 'Unauthorized' }, 401)

  if (!isEmailVerified(claims)) {
    return c.json(
      {
        error: 'Verify your email before creating an account.',
        code: AuthErrorCode.EMAIL_NOT_VERIFIED,
      },
      403
    )
  }

  const provider = signupProviderFromClaims(claims)
  if (!provider) {
    return c.json(
      { error: 'This sign-in method cannot create an account.' },
      400
    )
  }

  let user
  try {
    user = await createUserForSignup(claims.email, claims.sub, provider)
  } catch (error) {
    if (!(error instanceof SignupEmailTakenError)) throw error
    await discardCognitoUser(claims.sub)
    logger.info(
      { sub: claims.sub },
      'Discarded Cognito identity (signup, email belongs to another account)'
    )
    return c.json(
      {
        error:
          'An account already uses this email. Sign in, then connect this sign-in method in Settings.',
        code: AuthErrorCode.ACCOUNT_EXISTS,
      },
      409
    )
  }

  return c.json(
    { data: { id: user.id, onboardingCompleted: user.onboardingCompleted } },
    200
  )
})

/**
 * Deletes a Cognito user that no account will own, treating one already gone
 * as success (a concurrent request got there first).
 */
async function discardCognitoUser(sub: string): Promise<void> {
  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: sub,
      })
    )
  } catch (err) {
    if (!(err instanceof UserNotFoundException)) throw err
  }
}

// POST /v1/auth/signin/reject — called when a Sign In attempt finds no
// matching InfernoLog user for the just-completed Google OAuth identity.
// Synchronously deletes the Cognito user so no trace of this attempt
// persists anywhere — load-bearing for the COPPA argument that a rejected
// sign-in never retains a would-be user's data. Nothing here (or in the
// app-wide request logger) logs the claims payload itself, only the sub.
app.post('/auth/signin/reject', async (c) => {
  const claims = getVerifiedClaims(c)
  if (!claims) return c.json({ error: 'Unauthorized' }, 401)

  const existing = await prisma.authIdentity.findUnique({
    where: { cognitoSub: claims.sub },
    select: { id: true },
  })
  if (existing) {
    // Frontend only calls this after GET /v1/me 404s — a match here means
    // the two requests raced. Refuse rather than silently deleting a real
    // account's Cognito identity.
    return c.json({ error: 'A matching account exists' }, 400)
  }

  // A double-click race (a concurrent reject already deleted it) is success.
  await discardCognitoUser(claims.sub)

  logger.info(
    { sub: claims.sub },
    'Discarded Cognito identity (signin, no matching account)'
  )
  return c.json({ data: { discarded: true } }, 200)
})

export default app
