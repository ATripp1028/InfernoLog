// An account's sign-in methods, from Settings:
//
//   POST   /v1/me/identities/google  connect a Google account
//   DELETE /v1/me/identities/:id     remove a sign-in method
//
// Connecting happens only here, under the account's own session, with a fresh
// Google re-confirmation proving the caller controls that Google account —
// never by matching an email (CLAUDE.md, Auth flow). Discord is linked and
// unlinked through routes/account/discord.ts instead, since it cannot sign in.
//
// INVARIANT: an account always keeps at least one identity it can sign in
// with. Removal checks that under a row lock on the user, so two concurrent
// removals cannot each see the other's method as the survivor. The
// application enforces it, not the database; invariants.integration.test.ts
// sweeps for violations.

import { Hono } from 'hono'
import { AuthErrorCode, ConnectGoogleSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import { parseJsonBody } from '../../utils/requestBody'
import { GoogleProofError, verifyGoogleProof } from '../../utils/googleProof'
import { getVerifiedClaims } from '../../middleware/auth'
import { createErrorHandler, isUniqueViolation } from '../../middleware/errors'
import { deleteCognitoUserIfExists } from '../../services/cognito/client'
import {
  identitySelect,
  serializeIdentity,
} from '../../services/user/serialize'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

class LastSignInMethodError extends Error {}

app.onError(
  createErrorHandler('SignInMethods', (error, c) => {
    if (error instanceof GoogleProofError) {
      return c.json(
        {
          error: 'Confirm with Google again, then try once more.',
          code: AuthErrorCode.REAUTH_REQUIRED,
        },
        403
      )
    }
    if (error instanceof LastSignInMethodError) {
      return c.json(
        {
          error:
            'This is your only way to sign in. Add another before removing it.',
          code: AuthErrorCode.LAST_SIGN_IN_METHOD,
        },
        409
      )
    }
    return undefined
  })
)

const CONNECTED_ELSEWHERE = {
  error: 'That Google account is connected to a different InfernoLog account.',
  code: AuthErrorCode.CONNECTED_ELSEWHERE,
}

// POST /v1/me/identities/google
app.post('/me/identities/google', async (c) => {
  const userId = c.get('userId')
  const body = await parseJsonBody(c, ConnectGoogleSchema, {
    invalidMessage: 'Confirm with Google again, then try once more.',
  })
  if (!body.ok) return body.response

  const proof = await verifyGoogleProof(body.data.googleProof)

  const existing = await prisma.authIdentity.findUnique({
    where: { cognitoSub: proof.cognitoSub },
    select: { userId: true },
  })
  if (existing) {
    // Never delete here: that Cognito user is an account's live sign-in.
    return existing.userId === userId
      ? c.json(
          {
            error: 'That Google account is already connected.',
            code: AuthErrorCode.ALREADY_CONNECTED,
          },
          409
        )
      : c.json(CONNECTED_ELSEWHERE, 409)
  }

  const hasGoogle = await prisma.authIdentity.findFirst({
    where: { userId, provider: 'GOOGLE' },
    select: { id: true },
  })
  if (hasGoogle) {
    // One Google sign-in per account. The proof's Cognito user was created by
    // the re-confirmation and belongs to nobody, so it goes.
    await deleteCognitoUserIfExists(proof.cognitoSub)
    return c.json(
      {
        error:
          'A Google account is already connected. Remove it first to connect a different one.',
        code: AuthErrorCode.ALREADY_CONNECTED,
      },
      409
    )
  }

  let identity
  try {
    // Google's email is recorded on the identity only. It never becomes the
    // account email, and it may match another account's without consequence.
    identity = await prisma.authIdentity.create({
      data: {
        userId,
        provider: 'GOOGLE',
        cognitoSub: proof.cognitoSub,
        email: proof.email,
      },
      select: identitySelect,
    })
  } catch (error) {
    // A concurrent connect of the same Google account won the unique sub.
    if (isUniqueViolation(error)) return c.json(CONNECTED_ELSEWHERE, 409)
    throw error
  }

  logger.info({ userId }, 'Connected Google')
  return c.json({ data: { identity: serializeIdentity(identity) } }, 201)
})

// DELETE /v1/me/identities/:id
app.delete('/me/identities/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const identity = await prisma.authIdentity.findFirst({
    where: { id, userId },
    select: { id: true, cognitoSub: true },
  })
  if (!identity) return c.json({ error: 'Sign-in method not found' }, 404)
  const { cognitoSub } = identity
  if (!cognitoSub) {
    return c.json(
      { error: 'Disconnect this account from its own row in Settings.' },
      400
    )
  }

  await prisma.$transaction(async (tx) => {
    // Serializes removals for this account: a second concurrent removal waits
    // here, then counts what the first left behind.
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`
    const others = await tx.authIdentity.count({
      where: { userId, cognitoSub: { not: null }, NOT: { id } },
    })
    if (others === 0) throw new LastSignInMethodError()

    // Cognito first: if it fails, the row stays and a retry finds it. If the
    // row delete then failed, the retry would treat the already-deleted
    // Cognito user as gone and finish.
    await deleteCognitoUserIfExists(cognitoSub)
    await tx.authIdentity.delete({ where: { id } })
  })

  // A request made through the method just removed has lost its session.
  const signedOut = getVerifiedClaims(c)?.sub === cognitoSub
  logger.info({ userId, signedOut }, 'Removed a sign-in method')
  return c.json({ data: { removed: true, signedOut } })
})

export default app
