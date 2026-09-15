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
import { createErrorHandler, isUniqueViolation } from '../../middleware/errors'
import {
  createVerifiedPasswordUser,
  setPermanentPassword,
  signOutEverywhere,
  verifyCurrentPassword,
} from '../../services/cognito/passwordUser'
import { deleteCognitoUserIfExists } from '../../services/cognito/client'
import {
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
import {
  emailBelongsToAnotherAccount,
  findPasswordIdentity,
  requireOwnGoogleProof,
} from '../../services/user/signInChecks'
import { frontendUrl } from '../../utils/frontendUrl'
import type { HonoVariables } from '../../types/hono'
import { credentialErrorResponse } from './credentialErrors'

const app = new Hono<{ Variables: HonoVariables }>()

const INVALID_BODY = 'Check the fields and try again.'

app.onError(createErrorHandler('Password', credentialErrorResponse))

// PUT /v1/me/password
app.put('/me/password', async (c) => {
  const userId = c.get('userId')
  const body = await parseJsonBody(c, ChangePasswordSchema, {
    invalidMessage: INVALID_BODY,
  })
  if (!body.ok) return body.response
  const currentPassword = new Sensitive(body.data.currentPassword)
  const newPassword = new Sensitive(body.data.newPassword)

  const identity = await findPasswordIdentity(userId)
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

  if (await findPasswordIdentity(userId)) {
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

  if (await findPasswordIdentity(userId)) {
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
  let alreadyAdded = false
  try {
    await prisma.$transaction(async (tx) => {
      // Serializes setups for this account: a concurrent one (a double submit,
      // a second tab) passed the check above too, and must not add a second
      // PASSWORD identity.
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`
      const existing = await tx.authIdentity.findFirst({
        where: { userId, provider: 'PASSWORD', cognitoSub: { not: null } },
        select: { id: true },
      })
      if (existing) {
        alreadyAdded = true
        throw new Error('A password was added concurrently')
      }
      await tx.authIdentity.create({
        data: { userId, provider: 'PASSWORD', cognitoSub, email },
      })
      if (emailChanges) {
        await tx.user.update({ where: { id: userId }, data: { email } })
      }
    })
  } catch (error) {
    // A concurrent setup for the same email took over this same Cognito user
    // and attached it; deleting it would break that live sign-in.
    const attached = await prisma.authIdentity.findUnique({
      where: { cognitoSub },
      select: { id: true },
    })
    if (!attached) await deleteCognitoUserIfExists(cognitoSub)
    if (alreadyAdded) {
      return c.json(
        {
          error: 'This account already has a password.',
          code: AuthErrorCode.PASSWORD_EXISTS,
        },
        409
      )
    }
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
