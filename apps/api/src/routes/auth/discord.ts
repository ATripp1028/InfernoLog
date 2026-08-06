// GET /auth/discord/callback — the public OAuth redirect target.
//
// Mounted at /auth (NOT /v1) because the URL is registered with Discord and
// versioning it would break the registration. Public because Discord sends the
// browser here directly, with no Authorization header; the signed state from
// state.ts is what proves which signed-in user started the flow.
//
import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import { verifyConnectDiscordState } from './state'

const app = new Hono<{ Variables: HonoVariables }>()

// GET /auth/discord/callback?code=...&state=...
// Public route — Discord redirects here after the user approves. The signed
// state is what proves which signed-in user initiated the flow.
app.get('/discord/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const frontendUrl = process.env.FRONTEND_URL!

  const fail = (reason: string) =>
    c.redirect(`${frontendUrl}/settings?discord=error&reason=${reason}`)

  if (!code) return fail('missing_code')
  if (!state) return fail('missing_state')
  const payload = verifyConnectDiscordState(state)
  if (!payload) return fail('invalid_state')

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI!,
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
      }),
    })
    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      logger.error(
        { status: tokenRes.status, body },
        'Discord token exchange failed'
      )
      return fail('token_exchange_failed')
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!userRes.ok) {
      logger.error({ status: userRes.status }, 'Discord user fetch failed')
      return fail('user_fetch_failed')
    }
    const discordUser = (await userRes.json()) as { id: string }

    try {
      await prisma.user.update({
        where: { id: payload.userId },
        data: { discordId: discordUser.id },
      })
    } catch (err) {
      // P2002: the discordId is already attached to a different user.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        logger.warn(
          { userId: payload.userId, discordId: discordUser.id },
          'Discord account already linked to another user'
        )
        return fail('already_linked_elsewhere')
      }
      throw err
    }

    logger.info({ userId: payload.userId }, 'Discord connected')
    return c.redirect(
      `${frontendUrl}/settings?discord=connected&discordId=${encodeURIComponent(discordUser.id)}`
    )
  } catch (err) {
    logger.error({ err }, 'Discord callback error')
    Sentry.captureException(err)
    return fail('internal_error')
  }
})

export default app
