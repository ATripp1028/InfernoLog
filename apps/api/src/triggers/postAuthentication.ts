import * as dotenv from 'dotenv'

dotenv.config()

import { PostAuthenticationTriggerHandler } from 'aws-lambda'
import prisma from '../utils/prisma'
import * as Sentry from '@sentry/node'

export const handler: PostAuthenticationTriggerHandler = async (event) => {
  const { email, sub } = event.request.userAttributes
  const discordId = event.request.clientMetadata?.discordId

  if (!email || !sub) return event

  try {
    const existing = await prisma.user.findUnique({ where: { email } })

    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          username: email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6),
          cognitoSub: sub,
          discordId: discordId ?? null,
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
    } else {
      // Backfill cognitoSub for existing users (e.g. migrating from older schema)
      // and link discordId if Cognito knows it but our row doesn't.
      const updates: { cognitoSub?: string; discordId?: string } = {}
      if (!existing.cognitoSub) updates.cognitoSub = sub
      if (discordId && !existing.discordId) updates.discordId = discordId
      if (Object.keys(updates).length > 0) {
        await prisma.user.update({ where: { id: existing.id }, data: updates })
      }
    }
  } catch (error) {
    Sentry.captureException(error)
    console.error('postAuthentication error:', error)
  }

  return event
}
