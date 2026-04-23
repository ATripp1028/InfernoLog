import { createMiddleware } from 'hono/factory'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { PrismaClient } from '@prisma/client'
import * as Sentry from '@sentry/node'
import type { HonoVariables } from '../types/hono'

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID!,
})

export const authMiddleware = createMiddleware<{ Variables: HonoVariables }>(
  async (c, next) => {
    const authorization = c.req.header('Authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const token = authorization.slice(7)

    try {
      const payload = await verifier.verify(token)
      const cognitoSub = payload.sub
      const userEmail = payload.email as string

      // Resolve Cognito sub to internal Prisma user ID
      const prisma = new PrismaClient({
        datasourceUrl: process.env.DATABASE_URL!,
      })

      try {
        const user = await prisma.user.findFirst({
          where: { googleId: cognitoSub },
          select: { id: true },
        })

        if (!user) {
          return c.json({ error: 'User not found' }, 404)
        }

        // Set internal UUID as userId — all routes use this
        c.set('userId', user.id)
        c.set('userEmail', userEmail)
      } finally {
        await prisma.$disconnect()
      }

      await next()
    } catch (err) {
      Sentry.captureException(err)
      return c.json({ error: 'Invalid token' }, 401)
    }
  }
)