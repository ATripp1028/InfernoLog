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

import { createHmac, timingSafeEqual } from 'crypto'

const STATE_TTL_SECONDS = 10 * 60

/** The signed, time-limited payload carried through Discord's OAuth `state`. */
export type ConnectStatePayload = {
  nonce: string
  userId: string
  exp: number
}

/**
 * Mints the signed OAuth `state` that ties a Discord callback back to the
 * signed-in user.
 *
 * The browser reaches /auth/discord/callback via a top-level redirect from
 * Discord and so sends no Cognito JWT; this HMAC'd (userId, nonce, exp) triple
 * is what stands in for it. Called from the authenticated
 * POST /v1/me/connect-discord.
 *
 * @param userId - Internal user UUID to bind the callback to.
 * @param nonce - Per-request random value.
 * @returns `nonce.userId.exp.signature`, valid for 10 minutes.
 */
export function mintConnectDiscordState(userId: string, nonce: string): string {
  const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  const body = `${nonce}.${userId}.${exp}`
  const sig = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(body)
    .digest('hex')
  return `${body}.${sig}`
}

/**
 * Verifies a Discord OAuth `state` and returns its payload.
 *
 * Checks shape, HMAC signature, and expiry. Every failure returns null rather
 * than throwing or distinguishing the reason — the callback treats a bad state
 * as one indivisible "don't trust this redirect".
 *
 * @param state - The `state` query parameter Discord echoed back.
 * @returns The payload, or null if malformed, mis-signed, or expired.
 */
export function verifyConnectDiscordState(
  state: string
): ConnectStatePayload | null {
  const parts = state.split('.')
  if (parts.length !== 4) return null
  const [nonce, userId, expStr, sig] = parts as [string, string, string, string]
  const expected = createHmac('sha256', process.env.DISCORD_CLIENT_SECRET!)
    .update(`${nonce}.${userId}.${expStr}`)
    .digest('hex')
  // Constant-time compare. `!==` on a hex digest leaks, through response
  // timing, how many leading characters of a guess were right — which turns
  // forging a state (and with it, linking an arbitrary Discord account to an
  // arbitrary userId) from "break HMAC-SHA256" into a byte-at-a-time search.
  // Length-check first: timingSafeEqual throws on a length mismatch, and the
  // length of a hex digest is not a secret.
  const sigBuf = Buffer.from(sig, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (sigBuf.length !== expectedBuf.length) return null
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  return { nonce, userId, exp }
}
