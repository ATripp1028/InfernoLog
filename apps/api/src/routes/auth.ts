import { Hono } from 'hono'
import { createHmac, randomBytes } from 'crypto'
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
import { logger } from '../utils/logger'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' })

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

function signCustomAuthAnswer(cognitoSub: string): string {
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = createHmac('sha256', process.env.COGNITO_CUSTOM_AUTH_SECRET!)
    .update(`${cognitoSub}.${ts}`)
    .digest('hex')
  return `${cognitoSub}.${ts}.${sig}`
}

const LINK_TOKEN_TTL_SECONDS = 10 * 60 // 10 minutes

export type LinkTokenPayload = {
  discordId: string
  email: string
  exp: number
}

export function mintDiscordLinkToken(discordId: string, email: string): string {
  const payload: LinkTokenPayload = {
    discordId,
    email,
    exp: Math.floor(Date.now() / 1000) + LINK_TOKEN_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(body)
    .digest('base64url')
  return `${body}.${sig}`
}

export function verifyDiscordLinkToken(token: string): LinkTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts as [string, string]
  const expected = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(body)
    .digest('base64url')
  if (sig !== expected) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as LinkTokenPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.discordId || !payload.email) return null
    return payload
  } catch {
    return null
  }
}

// GET /auth/discord
app.get('/discord', async (c) => {
  const nonce = randomBytes(16).toString('hex')
  const state = makeState(nonce)

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
  const frontendUrl = process.env.FRONTEND_URL!
  const userPoolId = process.env.COGNITO_USER_POOL_ID!
  const clientId = process.env.COGNITO_CLIENT_ID!

  if (!code) return c.redirect(`${frontendUrl}?error=missing_code`)
  if (!state || !verifyState(state)) {
    logger.warn('Discord state validation failed')
    return c.redirect(`${frontendUrl}?error=invalid_state`)
  }

  try {
    // 1. Exchange code for Discord access token
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
      logger.error({ status: tokenRes.status, body }, 'Discord token exchange failed')
      return c.redirect(`${frontendUrl}?error=discord_token_failed`)
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string }

    // 2. Fetch Discord user
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!userRes.ok) {
      logger.error({ status: userRes.status }, 'Discord user fetch failed')
      return c.redirect(`${frontendUrl}?error=discord_user_failed`)
    }
    const discordUser = (await userRes.json()) as {
      id: string
      username: string
      email?: string
      verified?: boolean
    }
    if (!discordUser.email || !discordUser.verified) {
      return c.redirect(`${frontendUrl}?error=discord_email_required`)
    }

    // 3. Decide between "sign in existing Discord-linked user", "reject —
    // account exists but Discord isn't linked", and "create new account".
    // Our DB is the source of truth for whether Discord is linked, NOT email.
    // Email-based merging would silently combine separate Google/Discord
    // accounts that happen to share an email.
    let cognitoSub: string
    let cognitoUsername: string

    const linked = await prisma.user.findUnique({
      where: { discordId: discordUser.id },
      select: { email: true, cognitoSub: true },
    })

    if (linked) {
      // Existing user with this Discord linked — sign them in.
      if (!linked.cognitoSub) {
        logger.error({ discordId: discordUser.id }, 'Linked user missing cognitoSub')
        return c.redirect(`${frontendUrl}?error=internal_error`)
      }
      cognitoSub = linked.cognitoSub
      cognitoUsername = linked.email
    } else {
      // Discord isn't linked yet. If a Cognito account exists for this
      // email, hand the user off to a "link your Discord to the existing
      // account" flow that requires them to sign in with the existing
      // method first — proving ownership of BOTH identities.
      try {
        await cognito.send(
          new AdminGetUserCommand({ UserPoolId: userPoolId, Username: discordUser.email })
        )
        const linkToken = mintDiscordLinkToken(discordUser.id, discordUser.email)
        logger.info(
          { email: discordUser.email, discordId: discordUser.id },
          'Discord email collides with existing account; routing to link flow'
        )
        return c.redirect(`${frontendUrl}/auth/link-discord?token=${encodeURIComponent(linkToken)}`)
      } catch (err) {
        if (!(err instanceof UserNotFoundException)) throw err
      }

      // No collision — create a fresh Cognito user for Discord.
      const created = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: discordUser.email,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: discordUser.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: discordUser.username },
          ],
        })
      )
      const subAttr = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value
      if (!subAttr) throw new Error('AdminCreateUser response missing sub')
      cognitoSub = subAttr
      cognitoUsername = discordUser.email

      // Move user out of FORCE_CHANGE_PASSWORD into CONFIRMED so CUSTOM_AUTH
      // will accept them. The password is intentionally unguessable and never
      // used — Discord OAuth is the only entry point for these accounts.
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: discordUser.email,
          Password: randomBytes(32).toString('base64') + 'A1!',
          Permanent: true,
        })
      )
    }

    // 4. Initiate custom auth flow and respond with our signed nonce
    const initRes = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: 'CUSTOM_AUTH',
        AuthParameters: { USERNAME: cognitoUsername },
      })
    )
    if (initRes.ChallengeName !== 'CUSTOM_CHALLENGE' || !initRes.Session) {
      logger.error({ challenge: initRes.ChallengeName }, 'Unexpected Cognito challenge')
      return c.redirect(`${frontendUrl}?error=cognito_unexpected_challenge`)
    }

    const respRes = await cognito.send(
      new AdminRespondToAuthChallengeCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        ChallengeName: 'CUSTOM_CHALLENGE',
        Session: initRes.Session,
        ChallengeResponses: {
          USERNAME: cognitoUsername,
          ANSWER: signCustomAuthAnswer(cognitoSub),
        },
        ClientMetadata: { discordId: discordUser.id },
      })
    )

    const result = respRes.AuthenticationResult
    if (!result?.IdToken || !result.AccessToken || !result.RefreshToken) {
      logger.error({ result }, 'Cognito custom auth did not return tokens')
      return c.redirect(`${frontendUrl}?error=cognito_no_tokens`)
    }

    logger.info({ cognitoSub }, 'Discord auth minted Cognito tokens')

    // 5. Redirect with tokens in fragment so they don't hit logs / Referer
    const fragment = new URLSearchParams({
      id_token: result.IdToken,
      access_token: result.AccessToken,
      refresh_token: result.RefreshToken,
    }).toString()
    return c.redirect(`${frontendUrl}/auth/callback#${fragment}`)
  } catch (error) {
    logger.error({ error }, 'Discord callback error')
    Sentry.captureException(error)
    return c.redirect(`${frontendUrl}?error=internal_error`)
  }
})

export default app
