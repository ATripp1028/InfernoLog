import * as dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config()

import { PostAuthenticationTriggerHandler } from 'aws-lambda'
import prisma from '../utils/prisma'
import * as Sentry from '@sentry/node'

export const handler: PostAuthenticationTriggerHandler = async (event) => {
  const { email, sub } = event.request.userAttributes

  if (!email || !sub) return event

  try {
    const existing = await prisma.user.findUnique({ where: { email } })

    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          username:
            email.split('@')[0] + '_' + crypto.randomBytes(4).toString('hex'),
          cognitoSub: sub,
          ratingCategories: {
            create: [
              { name: 'Gameplay', weight: 0.6, sortOrder: 0 },
              { name: 'Decoration', weight: 0.2, sortOrder: 1 },
              { name: 'Song', weight: 0.2, sortOrder: 2 },
            ],
          },
          userLists: {
            create: [
              { name: 'Favorites', type: 'FAVORITES' },
              { name: 'Least Favorites', type: 'LEAST_FAVORITES' },
              { name: 'Want to Beat', type: 'WANT_TO_BEAT' },
            ],
          },
        },
      })
    } else if (!existing.cognitoSub) {
      // Backfill cognitoSub for users from the pre-rename schema.
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
