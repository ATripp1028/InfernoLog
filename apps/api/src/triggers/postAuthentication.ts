import * as dotenv from 'dotenv'
dotenv.config()

import { PostAuthenticationTriggerHandler } from 'aws-lambda'
import { PrismaClient } from '@prisma/client'
import * as Sentry from '@sentry/node'

export const handler: PostAuthenticationTriggerHandler = async (event) => {
  console.log('postAuthentication event:', JSON.stringify(event, null, 2))
  console.log('userAttributes:', JSON.stringify(event.request.userAttributes, null, 2))

  console.log('Environment variables:', {
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
    DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT ? 'SET' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
    PWD: process.env.PWD,
  })

  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL!,
  })

  const { email, name, sub } = event.request.userAttributes

  console.log('Extracted values:', { email, name, sub })

  try {
    const existing = await prisma.user.findUnique({
      where: { email: email! },
    })

    console.log('Existing user:', existing)

    if (!existing) {
      console.log('Creating new user...')
      const created = await prisma.user.create({
        data: {
          email: email!,
          username: email!.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6),
          googleId: sub!,
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
      console.log('User created:', JSON.stringify(created, null, 2))
    } else {
      console.log('User already exists, skipping creation')
    }
  } catch (error) {
    Sentry.captureException(error)
    console.error('Database error:', error)
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
  }

  return event
}