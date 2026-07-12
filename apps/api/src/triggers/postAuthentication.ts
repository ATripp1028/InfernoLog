import * as dotenv from 'dotenv'

dotenv.config()

import { PostAuthenticationTriggerHandler } from 'aws-lambda'
import prisma from '../utils/prisma'
import * as Sentry from '@sentry/node'

// User row creation now happens explicitly via POST /v1/auth/signup/start,
// reachable only after the frontend's age gate — never lazily here. This
// trigger only backfills cognitoSub onto a pre-existing user found by email
// (legacy accounts from before cognitoSub existed); it must never create a
// row, since a Sign-In attempt with no matching account relies on this
// trigger being a no-op for unrecognized identities.
export const handler: PostAuthenticationTriggerHandler = async (event) => {
  const { email, sub } = event.request.userAttributes

  if (!email || !sub) return event

  try {
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing && !existing.cognitoSub) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { cognitoSub: sub },
      })
    }
  } catch (error) {
    Sentry.captureException(error)
    console.error('postAuthentication error:', error)
  }

  return event
}
