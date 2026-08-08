import { createMiddleware } from 'hono/factory'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
import type { HonoVariables } from '../types/hono'

/**
 * API Gateway V2 JWT-authorizer-shape claims. Hono types this as `unknown`
 * because it only models the IAM authorizer in its built-in type.
 */
export type JwtClaims = {
  sub: string
  email?: string
}

/**
 * Reads the verified claims API Gateway's Cognito JWT authorizer attaches to
 * the request — used by authMiddleware (which also requires a User row) and
 * directly by routes that only need a verified identity, not an existing
 * InfernoLog user (e.g. signup/start, signin/reject).
 */
export function getVerifiedClaims(c: { env: unknown }): JwtClaims | null {
  const requestContext = (
    c.env as
      | { requestContext?: { authorizer?: { jwt?: { claims?: JwtClaims } } } }
      | undefined
  )?.requestContext
  const claims = requestContext?.authorizer?.jwt?.claims
  return claims?.sub ? claims : null
}

/**
 * Authenticates a request and puts the caller's identity on the context.
 *
 * Reads the claims API Gateway's Cognito JWT authorizer already verified, looks
 * up the matching `users` row by `cognitoSub`, and sets `userId` (the INTERNAL
 * UUID) and `userEmail`. Downstream handlers must take identity from
 * `c.get('userId')` and never from the Cognito sub or a request payload.
 *
 * Responds 401 when claims are missing (which means the authorizer is
 * misconfigured — it should have rejected the request first, so this also
 * reports to Sentry) and 404 when no InfernoLog user exists yet. Routes that
 * need a verified identity but tolerate a missing user row — signup/start,
 * signin/reject — are mounted ahead of this middleware and call
 * {@link getVerifiedClaims} directly.
 */
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
