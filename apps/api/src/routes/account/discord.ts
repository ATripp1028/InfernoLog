// Linking a Discord account:
//
//   POST   /v1/me/connect-discord
//   DELETE /v1/me/connect-discord
//
// The OAuth callback Discord redirects to is public and lives in routes/auth.ts
// — it has to be reachable without a token, since the browser arrives there
// straight from Discord. The signed state minted here is what ties that
// callback back to the signed-in user.

import { Hono } from 'hono'
import { randomBytes } from 'crypto'
import * as Sentry from '@sentry/node'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import { mintConnectDiscordState } from '../auth'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// POST /v1/me/connect-discord
// Returns a Discord OAuth URL with a signed state encoding the signed-in
// user's id. The browser navigates to that URL; Discord redirects back to the
// public callback in auth.ts, which validates the state and writes discordId.
app.post('/me/connect-discord', async (c) => {
  const userId = c.get('userId') as string

  try {
    const nonce = randomBytes(16).toString('hex')
    const state = mintConnectDiscordState(userId, nonce)

    const authUrl = new URL('https://discord.com/api/oauth2/authorize')
    authUrl.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID!)
    authUrl.searchParams.set('redirect_uri', process.env.DISCORD_REDIRECT_URI!)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'identify email')
    authUrl.searchParams.set('state', state)

    return c.json({ data: { url: authUrl.toString() } })
  } catch (error) {
    console.error('POST /me/connect-discord error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /v1/me/connect-discord
app.delete('/me/connect-discord', async (c) => {
  const userId = c.get('userId') as string

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { discordId: null },
    })
    logger.info({ userId }, 'Disconnected Discord from account')
    return c.json({ data: { disconnected: true } })
  } catch (error) {
    console.error('DELETE /me/connect-discord error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
