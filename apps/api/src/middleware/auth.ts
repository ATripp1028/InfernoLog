import { createMiddleware } from 'hono/factory'
import { createHmac } from 'crypto'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
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

    // Try Cognito JWT first
    let cognitoPayload: Awaited<ReturnType<typeof verifier.verify>> | null = null
    try {
      cognitoPayload = await verifier.verify(token)
    } catch {
      // Not a valid Cognito token — fall through to Discord JWT
    }

    if (cognitoPayload !== null) {
      const user = await prisma.user.findFirst({
        where: { googleId: cognitoPayload.sub },
        select: { id: true },
      })
      if (!user) return c.json({ error: 'User not found' }, 404)
      c.set('userId', user.id)
      c.set('userEmail', cognitoPayload.email as string)
      return await next()
    }

    // Try Discord JWT
    try {
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Malformed token')
      const [header, body, sig] = parts as [string, string, string]
      const secret = process.env.DISCORD_JWT_SECRET
      if (!secret) throw new Error('No JWT secret configured')
      const expected = createHmac('sha256', secret)
        .update(`${header}.${body}`)
        .digest('base64url')
      if (sig !== expected) throw new Error('Invalid signature')
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
        sub: string
        type: string
        exp: number
      }
      if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
      if (payload.type !== 'discord') throw new Error('Invalid token type')
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true },
      })
      if (!user) return c.json({ error: 'User not found' }, 404)
      c.set('userId', user.id)
      c.set('userEmail', user.email)
      return await next()
    } catch (err) {
      Sentry.captureException(err)
      return c.json({ error: 'Authentication failed' }, 401)
    }
  }
)
