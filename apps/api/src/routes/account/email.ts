// ⚠️ CREDENTIALS — these routes receive the current password and a
// verification code. Both are wrapped in `Sensitive` the moment the body is
// parsed and unwrapped only for the Cognito call or the HMAC. Never log either,
// never put either in an error or a response. Every path is covered by
// email.integration.test.ts's leak tests. See CLAUDE.md "Credential handling".
//
// Changing the account's email, from Settings:
//
//   POST /v1/me/email/start   prove it's you, then get a code at the new address
//   POST /v1/me/email/verify  enter the code; the email changes
//
// Proving it's you is the current password when the account has one, and a
// fresh Google re-confirmation when it doesn't. The new address is proven with
// a code sent there. An address another account has gets a notice instead of a
// code, exactly as at signup, so only its owner learns it's taken.
//
// When the account has an email-and-password sign-in, that sign-in's email is
// the account email (the invariant sweep checks it), so its Cognito user moves
// to the new address too — first, and back again if the account update fails,
// so the two never disagree. A connected Google account's email is only a
// record and is left as it is. The old address is told about the change.

import { Hono } from 'hono'
import {
  AuthErrorCode,
  EmailChangeStartSchema,
  EmailChangeVerifySchema,
} from '@infernolog/core'
import * as Sentry from '@sentry/node'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import { parseJsonBody } from '../../utils/requestBody'
import { sourceIp } from '../../utils/requestContext'
import { Sensitive } from '../../utils/sensitive'
import { frontendUrl } from '../../utils/frontendUrl'
import { GoogleProofError } from '../../utils/googleProof'
import { createErrorHandler, isUniqueViolation } from '../../middleware/errors'
import {
  changeNativeUserEmail,
  revertNativeUserEmail,
  verifyCurrentPassword,
} from '../../services/cognito/passwordUser'
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
import type { HonoVariables } from '../../types/hono'
import { credentialErrorResponse } from './credentialErrors'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(createErrorHandler('Email', credentialErrorResponse))

const ACCOUNT_EXISTS = {
  error: 'An account already uses this email.',
  code: AuthErrorCode.ACCOUNT_EXISTS,
}

// POST /v1/me/email/start
app.post('/me/email/start', async (c) => {
  const userId = c.get('userId')
  const body = await parseJsonBody(c, EmailChangeStartSchema, {
    invalidMessage: 'Check the fields and try again.',
  })
  if (!body.ok) return body.response
  const { newEmail } = body.data

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  })
  if (newEmail === user.email) {
    return c.json(
      {
        error: "That's already your email.",
        code: AuthErrorCode.SAME_EMAIL,
      },
      400
    )
  }

  const passwordIdentity = await findPasswordIdentity(userId)
  if (passwordIdentity?.email) {
    if (body.data.currentPassword === undefined) {
      return c.json(
        {
          error: 'Enter your current password.',
          code: AuthErrorCode.CURRENT_PASSWORD_INCORRECT,
        },
        400
      )
    }
    await verifyCurrentPassword(
      passwordIdentity.email,
      new Sensitive(body.data.currentPassword)
    )
  } else {
    if (body.data.googleProof === undefined) {
      throw new GoogleProofError('invalid')
    }
    await requireOwnGoogleProof(userId, body.data.googleProof)
  }

  // A row and an email either way, so whether the address is taken reaches
  // only the address's owner.
  const taken = await emailBelongsToAnotherAccount(newEmail, userId)
  const { verificationCode } = await issueCode({
    purpose: 'EMAIL_CHANGE',
    email: newEmail,
    userId,
    requesterIpHash: hashSourceIp(sourceIp(c)),
  })
  await sendEmail(
    newEmail,
    taken
      ? existingAccountEmail(frontendUrl())
      : verificationCodeEmail('EMAIL_CHANGE', verificationCode)
  )
  return c.json({ data: { sent: true } }, 202)
})

// POST /v1/me/email/verify
app.post('/me/email/verify', async (c) => {
  const userId = c.get('userId')
  const body = await parseJsonBody(c, EmailChangeVerifySchema, {
    invalidMessage: 'Enter the 6-digit code from the email.',
  })
  if (!body.ok) return body.response
  const { newEmail } = body.data

  const valid = await consumeCode({
    purpose: 'EMAIL_CHANGE',
    email: newEmail,
    userId,
    verificationCode: new Sensitive(body.data.verificationCode),
  })
  if (!valid) {
    return c.json(
      {
        error: 'That code is incorrect or has expired.',
        code: AuthErrorCode.INVALID_CODE,
      },
      400
    )
  }

  // The code proves the caller owns the new address, so saying it's taken
  // tells them nothing their own inbox wouldn't.
  if (await emailBelongsToAnotherAccount(newEmail, userId)) {
    return c.json(ACCOUNT_EXISTS, 409)
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  })
  const passwordIdentity = await findPasswordIdentity(userId)
  const movesSignIn = Boolean(passwordIdentity?.email)

  // Cognito first: a native user that can't move (an account already signs in
  // with the new address) stops the change before anything is written.
  if (passwordIdentity?.email) {
    await changeNativeUserEmail(passwordIdentity.email, newEmail)
  }

  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { email: newEmail } }),
      ...(passwordIdentity
        ? [
            prisma.authIdentity.update({
              where: { id: passwordIdentity.id },
              data: { email: newEmail },
            }),
          ]
        : []),
    ])
  } catch (error) {
    if (movesSignIn) {
      try {
        await revertNativeUserEmail(newEmail, user.email)
      } catch (revertError) {
        // The sign-in email now differs from the account email. Surface it
        // loudly: the invariant sweep would flag it, and support has to fix it.
        logger.error(
          { userId, err: revertError },
          'Failed to revert a native user email after the account update failed'
        )
        Sentry.captureException(revertError)
      }
    }
    if (isUniqueViolation(error)) return c.json(ACCOUNT_EXISTS, 409)
    throw error
  }

  logger.info({ userId, movedSignIn: movesSignIn }, 'Changed account email')

  // The change has happened; a failed notice is reported rather than failing
  // the request the user would then retry.
  try {
    await sendEmail(user.email, emailChangedEmail())
  } catch (error) {
    logger.error({ userId, err: error }, 'Failed to send email-changed notice')
    Sentry.captureException(error)
  }

  return c.json({ data: { email: newEmail } })
})

export default app
