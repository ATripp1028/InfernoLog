import { createMiddleware } from 'hono/factory'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
import { logger } from '../utils/logger'
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

/** The moderation-state fields {@link accountStatusDenial} decides on. */
type AccountState = {
  accountStatus: string
  suspensionUntil: Date | null
}

/**
 * Decides whether an account's moderation state bars it from the API.
 *
 * BANNED is permanent. SUSPENDED lasts until `suspensionUntil`; a suspension
 * whose end date has passed is treated as served and lets the request through,
 * so an expired suspension doesn't need a separate job to clear it. A
 * SUSPENDED row with no end date is treated as indefinite — the safe reading,
 * since "suspended forever" failing open would be the worse mistake.
 *
 * @param user - The account's status columns.
 * @returns The 403 body to return, or null when the account may proceed.
 */
export function accountStatusDenial(
  user: AccountState
): { body: { error: string; reason: string; until?: string } } | null {
  if (user.accountStatus === 'BANNED') {
    return { body: { error: 'This account is banned', reason: 'banned' } }
  }
  if (user.accountStatus === 'SUSPENDED') {
    const until = user.suspensionUntil
    if (!until || until.getTime() > Date.now()) {
      return {
        body: {
          error: 'This account is suspended',
          reason: 'suspended',
          ...(until ? { until: until.toISOString() } : {}),
        },
      }
    }
  }
  return null
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
 * reports to Sentry), 404 when no InfernoLog user exists yet, and 403 when the
 * account is banned or serving a suspension. Routes that need a verified
 * identity but tolerate a missing user row — signup/start, signin/reject — are
 * mounted ahead of this middleware and call {@link getVerifiedClaims} directly.
 *
 * The moderation gate lives HERE rather than per-route on purpose: every
 * authenticated route in the API is mounted behind this middleware, so a single
 * check covers all of them and a new endpoint can't forget it. `accountStatus`
 * is otherwise inert — nothing else in the API reads it — so without this a
 * BANNED user keeps full read/write access to their account and to every shared
 * surface (the level cache, GDDL submission) that a normal user can reach.
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
      select: {
        id: true,
        email: true,
        accountStatus: true,
        suspensionUntil: true,
      },
    })
    if (!user) return c.json({ error: 'User not found' }, 404)

    const denial = accountStatusDenial(user)
    if (denial) {
      logger.warn(
        { userId: user.id, accountStatus: user.accountStatus },
        'Blocked request from a non-active account'
      )
      return c.json(denial.body, 403)
    }

    c.set('userId', user.id)
    c.set('userEmail', claims.email ?? user.email)

    await next()
  }
)
