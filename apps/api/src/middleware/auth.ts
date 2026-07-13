import { createMiddleware } from 'hono/factory'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
import type { HonoVariables } from '../types/hono'

// API Gateway V2 JWT-authorizer-shape claims. Hono types this as `unknown`
// because it only models the IAM authorizer in its built-in type.
export type JwtClaims = {
  sub: string
  email?: string
}

// Reads the verified claims API Gateway's Cognito JWT authorizer attaches to
// the request — used by authMiddleware (which also requires a User row) and
// directly by routes that only need a verified identity, not an existing
// InfernoLog user (e.g. signup/start, signin/reject).
export function getVerifiedClaims(c: { env: unknown }): JwtClaims | null {
  const requestContext = (
    c.env as
      | { requestContext?: { authorizer?: { jwt?: { claims?: JwtClaims } } } }
      | undefined
  )?.requestContext
  const claims = requestContext?.authorizer?.jwt?.claims
  return claims?.sub ? claims : null
}

export const authMiddleware = createMiddleware<{ Variables: HonoVariables }>(
  async (c, next) => {
    const claims = getVerifiedClaims(c)

    if (!claims) {
      // The JWT authorizer should have rejected this before we ran. If we
      // got here without claims, something is misconfigured.
      Sentry.captureMessage('authMiddleware ran without verified JWT claims')
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const user = await prisma.user.findUnique({
      where: { cognitoSub: claims.sub },
      select: { id: true, email: true },
    })
    if (!user) return c.json({ error: 'User not found' }, 404)

    c.set('userId', user.id)
    c.set('userEmail', claims.email ?? user.email)

    await next()
  }
)
