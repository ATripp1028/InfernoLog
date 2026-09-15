// ⚠️ CREDENTIALS — these routes receive plaintext passwords and verification
// codes. Both are wrapped in `Sensitive` the moment the body is parsed and
// unwrapped only for the Cognito call or the HMAC. Never log either, never put
// either in an error or a response. Every path through here is covered by
// password.integration.test.ts's leak tests. See CLAUDE.md "Credential
// handling".
//
// An account's email-and-password sign-in, from Settings:
//
//   PUT  /v1/me/password              change it (current password required)
//   POST /v1/me/password/setup/start  add one: re-confirm with Google, and get
//                                     a code if the chosen email is new
//   POST /v1/me/password/setup        add one: create it
//
// Adding a password is creating a new way to sign in, so it takes a fresh
// Google re-confirmation (utils/googleProof.ts) on top of the session: a
// stolen session alone must not be able to plant a lasting way back in. The
// sign-in email the user picks becomes the account email, taking priority over
// Google's; a new address is proven with a code first.

import { Hono } from 'hono'
import {
  AuthErrorCode,
  ChangePasswordSchema,
  PasswordSetupSchema,
  PasswordSetupStartSchema,
} from '@infernolog/core'
import * as Sentry from '@sentry/node'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import { parseJsonBody } from '../../utils/requestBody'
import { sourceIp } from '../../utils/requestContext'
import { Sensitive } from '../../utils/sensitive'
import { GoogleProofError, verifyGoogleProof } from '../../utils/googleProof'
import { createErrorHandler, isUniqueViolation } from '../../middleware/errors'
import {
  CurrentPasswordIncorrectError,
  PasswordRejectedError,
  PasswordUserExistsError,
  TooManyPasswordAttemptsError,
  createVerifiedPasswordUser,
  setPermanentPassword,
  signOutEverywhere,
  verifyCurrentPassword,
} from '../../services/cognito/passwordUser'
import { deleteCognitoUserIfExists } from '../../services/cognito/client'
import {
  VerificationRateLimitedError,
  consumeCode,
  hashSourceIp,
  issueCode,
} from '../../services/verification'
import {
  emailChangedEmail,
  existingAccountEmail,
  sendEmail,
  verificationCodeEmail,
} from '../../services/email'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

const INVALID_BODY = 'Check the fields and try again.'

app.onError(
  createErrorHandler('Password', (error, c) => {
    if (error instanceof CurrentPasswordIncorrectError) {
      return c.json(
        {
          error: "That's not your current password.",
          code: AuthErrorCode.CURRENT_PASSWORD_INCORRECT,
        },
        400
      )
    }
    if (error instanceof TooManyPasswordAttemptsError) {
      return c.json(
        {
          error: 'Too many attempts. Try again in a few minutes.',
          code: AuthErrorCode.TOO_MANY_ATTEMPTS,
        },
        429
      )
    }
    if (error instanceof GoogleProofError) {
      return c.json(
        {
          error: 'Confirm with Google again, then try once more.',
          code: AuthErrorCode.REAUTH_REQUIRED,
        },
        403
      )
    }
    if (error instanceof VerificationRateLimitedError) {
      return c.json(
        {
          error: 'Too many codes have been requested. Try again in an hour.',
          code: AuthErrorCode.RATE_LIMITED,
        },
        429
      )
    }
    if (error instanceof PasswordUserExistsError) {
      return c.json(
        {
          error: 'An account already uses this email.',
          code: AuthErrorCode.ACCOUNT_EXISTS,
        },
        409
      )
    }
    if (error instanceof PasswordRejectedError) {
      return c.json(
        { error: "That password doesn't meet the requirements." },
        400
      )
    }
    return undefined
  })
)

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'https://infernolog.com'
}

async function passwordIdentity(userId: string) {
  return prisma.authIdentity.findFirst({
    where: { userId, provider: 'PASSWORD', cognitoSub: { not: null } },
    select: { id: true, email: true },
  })
}

/**
 * Verifies a Google re-confirmation and that it is one of THIS account's
 * Google identities. A valid proof for somebody else's Google account proves
 * nothing about the caller.
 */
async function requireOwnGoogleProof(userId: string, googleProof: string) {
  const proof = await verifyGoogleProof(googleProof)
  const owned = await prisma.authIdentity.findFirst({
    where: { userId, provider: 'GOOGLE', cognitoSub: proof.cognitoSub },
    select: { id: true },
  })
  if (!owned) throw new GoogleProofError('invalid')
  return proof
}

async function emailBelongsToAnotherAccount(email: string, userId: string) {
  const other = await prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
    select: { id: true },
  })
  return other !== null
}

// PUT /v1/me/password
app.put('/me/password', async (c) => {
  const userId = c.get('userId')
  const body = await parseJsonBody(c, ChangePasswordSchema, {
    invalidMessage: INVALID_BODY,
  })
  if (!body.ok) return body.response
  const currentPassword = new Sensitive(body.data.currentPassword)
  const newPassword = new Sensitive(body.data.newPassword)

  const identity = await passwordIdentity(userId)
  if (!identity?.email) {
    return c.json(
      {
        error: "This account doesn't have a password yet.",
        code: AuthErrorCode.NO_PASSWORD,
      },
      409
    )
  }

  await verifyCurrentPassword(identity.email, currentPassword)
  await setPermanentPassword(identity.email, newPassword)
  if (body.data.signOutOthers) await signOutEverywhere(identity.email)

  logger.info(
    { userId, signedOutOthers: body.data.signOutOthers },
    'Changed password'
  )
  return c.json({ data: { signedOutOthers: body.data.signOutOthers } })
})

// POST /v1/me/password/setup/start
app.post('/me/password/setup/start', async (c) => {
  const userId = c.get('userId')
  const body = await parseJsonBody(c, PasswordSetupStartSchema, {
    invalidMessage: INVALID_BODY,
  })
  if (!body.ok) return body.response
  const { email, googleProof } = body.data

  if (await passwordIdentity(userId)) {
    return c.json(
      {
        error: 'This account already has a password.',
        code: AuthErrorCode.PASSWORD_EXISTS,
      },
      409
    )
  }
  await requireOwnGoogleProof(userId, googleProof)

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  })
  // The account's own address was verified when the account was created, so
  // there is nothing to prove.
  if (email === user.email) {
    return c.json({ data: { codeRequired: false } })
  }

  // As at signup: a row and an email either way, so whether the address has an
  // account is told only to the address's owner.
  const taken = await emailBelongsToAnotherAccount(email, userId)
  const { verificationCode } = await issueCode({
    purpose: 'PASSWORD_SETUP',
    email,
    userId,
    requesterIpHash: hashSourceIp(sourceIp(c)),
  })
  await sendEmail(
    email,
    taken
      ? existingAccountEmail(frontendUrl())
      : verificationCodeEmail('PASSWORD_SETUP', verificationCode)
  )
  return c.json({ data: { codeRequired: true } }, 202)
})

// POST /v1/me/password/setup
app.post('/me/password/setup', async (c) => {
  const userId = c.get('userId')
  const body = await parseJsonBody(c, PasswordSetupSchema, {
    invalidMessage: INVALID_BODY,
  })
  if (!body.ok) return body.response
  const { email, googleProof } = body.data
  const newPassword = new Sensitive(body.data.newPassword)

  if (await passwordIdentity(userId)) {
    return c.json(
      {
        error: 'This account already has a password.',
        code: AuthErrorCode.PASSWORD_EXISTS,
      },
      409
    )
  }
  await requireOwnGoogleProof(userId, googleProof)

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  })
  const emailChanges = email !== user.email

  if (emailChanges) {
    const valid =
      body.data.verificationCode !== undefined &&
      (await consumeCode({
        purpose: 'PASSWORD_SETUP',
        email,
        userId,
        verificationCode: new Sensitive(body.data.verificationCode),
      }))
    if (!valid) {
      return c.json(
        {
          error: 'That code is incorrect or has expired.',
          code: AuthErrorCode.INVALID_CODE,
        },
        400
      )
    }
    if (await emailBelongsToAnotherAccount(email, userId)) {
      return c.json(
        {
          error: 'An account already uses this email.',
          code: AuthErrorCode.ACCOUNT_EXISTS,
        },
        409
      )
    }
  }

  const { cognitoSub } = await createVerifiedPasswordUser(email, newPassword)

  // Cognito and Postgres can't share a transaction, so the Cognito user made
  // above is removed again if the account can't take it.
  try {
    await prisma.$transaction([
      prisma.authIdentity.create({
        data: { userId, provider: 'PASSWORD', cognitoSub, email },
      }),
      ...(emailChanges
        ? [prisma.user.update({ where: { id: userId }, data: { email } })]
        : []),
    ])
  } catch (error) {
    await deleteCognitoUserIfExists(cognitoSub)
    if (isUniqueViolation(error)) {
      return c.json(
        {
          error: 'An account already uses this email.',
          code: AuthErrorCode.ACCOUNT_EXISTS,
        },
        409
      )
    }
    throw error
  }

  logger.info({ userId, emailChanged: emailChanges }, 'Added a password')

  if (emailChanges) {
    // The change has happened; a failed notice is reported, not surfaced as a
    // failure the user would retry.
    try {
      await sendEmail(user.email, emailChangedEmail())
    } catch (error) {
      logger.error(
        { userId, err: error },
        'Failed to send email-changed notice'
      )
      Sentry.captureException(error)
    }
  }

  return c.json({ data: { email } }, 201)
})

export default app
