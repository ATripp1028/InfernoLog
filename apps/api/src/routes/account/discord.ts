// Linking a Discord account:
//
//   POST   /v1/me/connect-discord           — start: mint the authorize URL
//   POST   /v1/me/connect-discord/complete  — finish: exchange the code, link
//   DELETE /v1/me/connect-discord           — unlink
//
// Both halves of the flow are authenticated, which is the point. The redirect
// target Discord sends the browser to (routes/auth/discord.ts) is necessarily
// public — a top-level navigation carries no Authorization header — so it was
// made a bouncer that only forwards `code` and `state` to the frontend. Every
// decision and the only write happen here, under the caller's JWT.
//
// See routes/auth/discord.ts for the account-linking CSRF this structure
// closes, and why a confirmation step would not have closed it.

import { Hono } from 'hono'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import prisma from '../../utils/prisma'
import { isUniqueViolation } from '../../middleware/errors'
import { logger } from '../../utils/logger'
import {
  mintConnectDiscordState,
  verifyConnectDiscordState,
} from '../../utils/discordState'
import {
  exchangeDiscordCode,
  fetchDiscordUserId,
  DiscordOAuthError,
} from '../../utils/discord'
import { parseJsonBody } from '../../utils/requestBody'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Bounded because both values cross the wire from the browser: `code` is a
// Discord authorization code and `state` is our own minted token, and neither
// is anywhere near these ceilings.
const CompleteDiscordLinkSchema = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(512),
})

// POST /v1/me/connect-discord — start the link.
//
// Returns a Discord OAuth URL carrying a signed state that encodes the
// signed-in user's id. The browser navigates there; Discord redirects to the
// public bouncer in auth/discord.ts, which forwards the code and state to the
// frontend, which posts them back to /complete below.
//
// Minting is deliberately unprivileged — a state is not a capability. It names
// an account, and completing a flow for that account additionally requires
// that account's JWT, so handing one out to whoever asks grants nothing.
app.post('/me/connect-discord', async (c) => {
  const userId = c.get('userId')

  const nonce = randomBytes(16).toString('hex')
  const state = mintConnectDiscordState(userId, nonce)

  const authUrl = new URL('https://discord.com/api/oauth2/authorize')
  authUrl.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', process.env.DISCORD_REDIRECT_URI!)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'identify email')
  authUrl.searchParams.set('state', state)

  return c.json({ data: { url: authUrl.toString() } })
})

// POST /v1/me/connect-discord/complete — finish the link.
//
// THE AUTHORIZATION CHECK IS THE WHOLE POINT OF THIS ENDPOINT. A validly
// signed state proves only that some authenticated user minted it; it says
// nothing about who is presenting it back. Requiring it to name the caller is
// what ties "somebody approved this Discord account" to "this specific
// InfernoLog account asked to link it" — the two facts the old public callback
// conflated.
//
// The code is exchanged only after that check passes, so a mismatched state
// costs nothing and reveals nothing: we never learn which Discord account the
// code belonged to.
app.post('/me/connect-discord/complete', async (c) => {
  const userId = c.get('userId')

  const parsed = await parseJsonBody(c, CompleteDiscordLinkSchema)
  if (!parsed.ok) return parsed.response

  const payload = verifyConnectDiscordState(parsed.data.state)
  if (!payload) {
    // Malformed, mis-signed, or past its 10 minutes — one indivisible verdict.
    return c.json({ error: 'invalid_state', reason: 'invalid_state' }, 400)
  }

  if (payload.userId !== userId) {
    // Someone is completing a flow that was started by a different account.
    // The benign version is a stale tab after an account switch; the hostile
    // version is the linking CSRF described in routes/auth/discord.ts. Both
    // get refused, and the code is never spent.
    logger.warn(
      { userId, stateUserId: payload.userId },
      'Discord link rejected: state belongs to a different account'
    )
    return c.json({ error: 'state_mismatch', reason: 'state_mismatch' }, 403)
  }

  let discordId: string
  try {
    discordId = await fetchDiscordUserId(
      await exchangeDiscordCode(parsed.data.code)
    )
  } catch (err) {
    // Discord refusing the code or being unreachable is an upstream fault the
    // user can retry, not a server fault of ours — 502, and nothing from
    // Discord's response body is echoed back.
    if (err instanceof DiscordOAuthError) {
      logger.warn({ userId, err: err.message }, 'Discord exchange failed')
      return c.json({ error: err.message, reason: 'exchange_failed' }, 502)
    }
    throw err
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { discordId } })
  } catch (err) {
    // P2002: discordId is unique — this Discord account is already on another
    // InfernoLog user.
    if (isUniqueViolation(err)) {
      logger.warn({ userId }, 'Discord account already linked to another user')
      return c.json(
        {
          error: 'That Discord account is already connected to a different InfernoLog user.',
          reason: 'already_linked_elsewhere',
        },
        409
      )
    }
    throw err
  }

  logger.info({ userId }, 'Discord connected')
  return c.json({ data: { discordId } })
})

// DELETE /v1/me/connect-discord
app.delete('/me/connect-discord', async (c) => {
  const userId = c.get('userId')

  await prisma.user.update({
    where: { id: userId },
    data: { discordId: null },
  })
  logger.info({ userId }, 'Disconnected Discord from account')
  return c.json({ data: { disconnected: true } })
})

export default app
