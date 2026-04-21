import { createMiddleware } from 'hono/factory'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
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
      c.set('userId', payload.sub)
      c.set('userEmail', payload.email as string)
      await next()
    } catch {
      return c.json({ error: 'Invalid token' }, 401)
    }
  }
)