import { Hono } from 'hono'
import { createHmac, randomBytes } from 'crypto'
import { getCookie, setCookie } from 'hono/cookie'
import prisma from '../utils/prisma'
import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

function makeState(nonce: string): string {
  const sig = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(nonce)
    .digest('hex')
  return `${nonce}.${sig}`
}

function verifyState(state: string): boolean {
  const dot = state.lastIndexOf('.')
  if (dot === -1) return false
  const nonce = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(nonce)
    .digest('hex')
  return sig === expected
}

function makeJwt(userId: string): string {
  const secret = process.env.DISCORD_JWT_SECRET!
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const body = Buffer.from(JSON.stringify({
    sub: userId,
    type: 'discord',
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
  })).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

// GET /auth/discord
app.get('/discord', async (c) => {
  const nonce = randomBytes(16).toString('hex')
  const state = makeState(nonce)

  setCookie(c, 'discord_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 300,
    path: '/',
  })

  const authUrl = new URL('https://discord.com/api/oauth2/authorize')
  authUrl.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', process.env.DISCORD_REDIRECT_URI!)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'identify email')
  authUrl.searchParams.set('state', state)

  return c.json({ url: authUrl.toString() })
})

// GET /auth/discord/callback?code=...&state=...
app.get('/discord/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const stateCookie = getCookie(c, 'discord_state')
  const frontendUrl = process.env.FRONTEND_URL!

  if (!code) return c.redirect(`${frontendUrl}?error=missing_code`)

  // Validate via cookie match AND HMAC signature
  if (!state || state !== stateCookie || !verifyState(state)) {
    logger.warn({ state, hasCookie: !!stateCookie }, 'State validation failed in Discord callback')
    return c.redirect(`${frontendUrl}?error=invalid_state`)
  }

  try {
    // Exchange code for Discord access token
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
      logger.error({ status: tokenRes.status }, 'Discord token exchange failed')
      return c.redirect(`${frontendUrl}?error=discord_token_failed`)
    }

    const { access_token } = await tokenRes.json() as { access_token: string }

    // Fetch Discord user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!userRes.ok) {
      logger.error({ status: userRes.status }, 'Discord user fetch failed')
      return c.redirect(`${frontendUrl}?error=discord_user_failed`)
    }

    const discordUser = await userRes.json() as {
      id: string
      username: string
      email?: string
      verified?: boolean
    }

    if (!discordUser.email || !discordUser.verified) {
      return c.redirect(`${frontendUrl}?error=discord_email_required`)
    }

    // Find or create the InfernoLog user
    let user = await prisma.user.findUnique({ where: { discordId: discordUser.id } })

    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email: discordUser.email } })
      if (byEmail) {
        // Link Discord to existing account found by email
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { discordId: discordUser.id },
        })
      } else {
        // New user — create with Discord identity
        user = await prisma.user.create({
          data: {
            email: discordUser.email,
            username: discordUser.username + '_' + Math.random().toString(36).slice(2, 6),
            discordId: discordUser.id,
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
      }
    }

    const token = makeJwt(user.id)
    logger.info({ userId: user.id }, 'Discord auth successful')
    return c.redirect(`${frontendUrl}/auth/callback?token=${token}`)
  } catch (error) {
    logger.error({ error }, 'Discord callback error')
    Sentry.captureException(error)
    return c.redirect(`${frontendUrl}?error=internal_error`)
  }
})

export default app
