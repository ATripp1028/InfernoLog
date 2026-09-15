// ⚠️ CREDENTIALS — these routes receive plaintext passwords and verification
// codes. Both are wrapped in `Sensitive` the moment the body is parsed and
// unwrapped only for the HMAC and the Cognito call. Never log either, never put
// either in an error or a response. Every path through here is covered by
// passwordSignup.integration.test.ts's leak tests. See CLAUDE.md "Credential
// handling".
//
// Email-and-password signup, in two public steps (no token exists yet):
//
//   POST /v1/auth/password-signup/start   {email}
//   POST /v1/auth/password-signup/verify  {email, verificationCode, password}
//
// `start` always answers 202 and always sends an email. A free address gets a
// code; an address that already has an account gets a notice saying so,
// instead of the form saying so to whoever typed it. `verify` proves the
// address, then creates the native Cognito user. The browser then signs in
// with SRP and calls POST /v1/auth/signup/start like a Google signup would, so
// the InfernoLog account is created in exactly one place.
//
// Mounted in src/index.ts before authMiddleware. Rate limits are enforced per
// address and per hashed source IP by services/verification.

import { Hono } from 'hono'
import {
  AuthErrorCode,
  PasswordSignupStartSchema,
  PasswordSignupVerifySchema,
} from '@infernolog/core'
import prisma from '../../utils/prisma'
import { parseJsonBody } from '../../utils/requestBody'
import { sourceIp } from '../../utils/requestContext'
import { Sensitive } from '../../utils/sensitive'
import { createErrorHandler } from '../../middleware/errors'
import {
  VerificationRateLimitedError,
  consumeCode,
  hashSourceIp,
  issueCode,
} from '../../services/verification'
import {
  existingAccountEmail,
  sendEmail,
  verificationCodeEmail,
} from '../../services/email'
import {
  PasswordRejectedError,
  PasswordUserExistsError,
  createVerifiedPasswordUser,
} from '../../services/cognito/passwordUser'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

const ACCOUNT_EXISTS_MESSAGE =
  'An account already uses this email. Sign in instead.'

app.onError(
  createErrorHandler('PasswordSignup', (error, c) => {
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
        { error: ACCOUNT_EXISTS_MESSAGE, code: AuthErrorCode.ACCOUNT_EXISTS },
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

async function accountHasEmail(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  return user !== null
}

// POST /v1/auth/password-signup/start
app.post('/auth/password-signup/start', async (c) => {
  const body = await parseJsonBody(c, PasswordSignupStartSchema)
  if (!body.ok) return body.response
  const { email } = body.data

  const taken = await accountHasEmail(email)
  // A row is written — and counted against the limits — either way, so the
  // two outcomes cost the same and look the same from outside.
  const { verificationCode } = await issueCode({
    purpose: 'SIGNUP',
    email,
    requesterIpHash: hashSourceIp(sourceIp(c)),
  })
  await sendEmail(
    email,
    taken
      ? existingAccountEmail(frontendUrl())
      : verificationCodeEmail('SIGNUP', verificationCode)
  )

  return c.json({ data: { sent: true } }, 202)
})

// POST /v1/auth/password-signup/verify
app.post('/auth/password-signup/verify', async (c) => {
  // A fixed message: the body carries a password and a code, and a validation
  // error must not be the thing that echoes either back. The form enforces the
  // same rules before it submits, so a real user never sees this.
  const body = await parseJsonBody(c, PasswordSignupVerifySchema, {
    invalidMessage: 'Check the email, code, and password, then try again.',
  })
  if (!body.ok) return body.response
  const { email } = body.data
  const verificationCode = new Sensitive(body.data.verificationCode)
  const password = new Sensitive(body.data.password)

  const valid = await consumeCode({
    purpose: 'SIGNUP',
    email,
    verificationCode,
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

  // The code proves this caller owns the address, so telling them it already
  // has an account reveals nothing they could not read in their own inbox.
  if (await accountHasEmail(email)) {
    return c.json(
      { error: ACCOUNT_EXISTS_MESSAGE, code: AuthErrorCode.ACCOUNT_EXISTS },
      409
    )
  }

  await createVerifiedPasswordUser(email, password)
  return c.json({ data: { created: true } }, 201)
})

export default app
