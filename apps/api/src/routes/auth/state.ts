// The signed state that ties the public Discord callback back to a signed-in
// user.
//
// The browser arrives at /auth/discord/callback via a top-level redirect from
// Discord, so it sends no Cognito JWT. State carries a signed (userId, nonce,
// exp) instead — minted by POST /v1/me/connect-discord (routes/account/
// discord.ts, which IS authenticated) and verified here on the way back.
//
// Separate from discord.ts so the account module can import the minter without
// pulling in the callback route.

import { createHmac } from 'crypto'

const STATE_TTL_SECONDS = 10 * 60

export type ConnectStatePayload = {
  nonce: string
  userId: string
  exp: number
}

export function mintConnectDiscordState(userId: string, nonce: string): string {
  const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  const body = `${nonce}.${userId}.${exp}`
  const sig = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(body)
    .digest('hex')
  return `${body}.${sig}`
}

export function verifyConnectDiscordState(
  state: string
): ConnectStatePayload | null {
  const parts = state.split('.')
  if (parts.length !== 4) return null
  const [nonce, userId, expStr, sig] = parts as [string, string, string, string]
  const expected = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(`${nonce}.${userId}.${expStr}`)
    .digest('hex')
  if (sig !== expected) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  return { nonce, userId, exp }
}
