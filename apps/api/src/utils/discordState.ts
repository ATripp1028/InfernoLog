// The signed state carried through Discord's OAuth flow.
//
// WHAT THIS DOES AND DOES NOT PROVE. Verifying the signature establishes that
// the `userId` inside was put there by this server, for someone authenticated
// at mint time. It does NOT establish that whoever presents the state back is
// that user — anyone can be handed a validly-signed state and complete the
// flow with it.
//
// That gap used to be exploitable, because the public callback wrote
// `discordId` straight onto the state's `userId`: an attacker could mint a
// state for their OWN account, get a victim to approve the Discord consent
// screen, and have the victim's Discord identity attached to the attacker's
// profile. The state was doing exactly what it was designed to do; it simply
// was not evidence of the fact the write depended on.
//
// The fix is not in this file. POST /v1/me/connect-discord/complete
// (routes/account/discord.ts) now performs the code exchange under the caller's
// JWT and requires `payload.userId === c.get('userId')` before writing
// anything, so the state's claim is checked against an authenticated identity
// rather than trusted on its own. This module's job is narrower than it looks:
// it carries a userId across a redirect without letting anyone tamper with it.
//
// Separate from routes/auth/discord.ts so the account module can import the
// minter without pulling in the redirect target.

import { createHmac, timingSafeEqual } from 'crypto'

const STATE_TTL_SECONDS = 10 * 60

// Signed with a purpose-specific secret rather than DISCORD_CLIENT_SECRET,
// which this used to reuse. Nothing about that was exploitable — HMAC does not
// leak its key — but it fused two unrelated lifecycles: rotating the OAuth
// client credential (routine, and forced by Discord if it ever leaks) would
// have silently invalidated every in-flight link, and any place the signing key
// turned up would have been an OAuth client compromise as well.
function stateSecret(): string {
  const secret = process.env.DISCORD_STATE_SECRET
  if (!secret) throw new Error('DISCORD_STATE_SECRET is not configured')
  return secret
}

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
 * The browser reaches the redirect target via a top-level navigation from
 * Discord and so sends no Cognito JWT; this HMAC'd (userId, nonce, exp) triple
 * is how the userId survives the round trip untampered. Called from the
 * authenticated POST /v1/me/connect-discord.
 *
 * @param userId - Internal user UUID the link attempt is for.
 * @param nonce - Per-request random value. It makes two states minted in the
 * same second differ, and nothing more — it is NOT replay protection, and no
 * server-side record of it is kept. Replay is closed one level up instead:
 * completing a flow needs both a single-use Discord `code` and the JWT of the
 * account named in the state, so a captured state is inert to anyone who
 * isn't already that user.
 * @returns `nonce.userId.exp.signature`, valid for 10 minutes.
 */
export function mintConnectDiscordState(userId: string, nonce: string): string {
  const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  const body = `${nonce}.${userId}.${exp}`
  const sig = createHmac('sha256', stateSecret())
    .update(body)
    .digest('hex')
  return `${body}.${sig}`
}

/**
 * Verifies a Discord OAuth `state` and returns its payload.
 *
 * Checks shape, HMAC signature, and expiry. Every failure returns null rather
 * than throwing or distinguishing the reason — a bad state is one indivisible
 * "don't trust this".
 *
 * A payload returned from here is NOT authorization on its own. The caller must
 * still confirm that `userId` matches the authenticated caller; see this
 * module's header.
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
  const expected = createHmac('sha256', stateSecret())
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
