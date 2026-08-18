// Client for the two Discord endpoints the account-linking flow needs: the
// OAuth token exchange and the identity read.
//
// Extracted from routes/auth/discord.ts when the linking flow moved the code
// exchange behind the JWT (see routes/account/discord.ts). It lives in utils/
// alongside the other external-service clients (gddl.ts, robtop.ts,
// songFileHub.ts) rather than in the route, because the caller is now an
// authenticated route in a different module from the public redirect target.
//
// Unlike those clients, a failure here is NOT an expected branch to swallow:
// the user explicitly asked to link an account and is waiting on the answer,
// so failures throw and the route turns them into a 502. Nothing in this
// module logs the code, the access token, or the client secret.

const DISCORD_API_BASE_URL = 'https://discord.com/api'

// Discord is a hard dependency of a request the user is blocking on, so the
// timeout is short enough to fail before API Gateway's own 29s integration
// timeout turns it into an opaque 504.
const FETCH_TIMEOUT_MS = 8000

/**
 * Discord refused the exchange or could not be reached.
 *
 * Carries no detail from Discord's response body — that body echoes request
 * parameters, which on the token endpoint includes the client secret.
 */
export class DiscordOAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscordOAuthError'
  }
}

async function withTimeout(
  input: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch {
    throw new DiscordOAuthError('Could not reach Discord')
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Exchanges a Discord authorization code for an access token.
 *
 * The code is single-use and short-lived, which is what makes it safe to have
 * travelled through the user's browser to get here: by the time it reaches
 * this function it has been presented by a caller holding the JWT of the
 * account the link is for.
 *
 * @param code - The `code` Discord returned to the redirect URI.
 * @returns The bearer access token, for {@link fetchDiscordUserId}.
 * @throws {DiscordOAuthError} Discord rejected the code or was unreachable.
 */
export async function exchangeDiscordCode(code: string): Promise<string> {
  const res = await withTimeout(`${DISCORD_API_BASE_URL}/oauth2/token`, {
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
  if (!res.ok) {
    // Status only. Discord's error body for this endpoint restates the request
    // parameters, and those include client_secret.
    throw new DiscordOAuthError(`Discord rejected the code (${res.status})`)
  }

  const body = (await res.json()) as { access_token?: unknown }
  if (typeof body.access_token !== 'string' || !body.access_token) {
    throw new DiscordOAuthError('Discord returned no access token')
  }
  return body.access_token
}

/**
 * Reads the Discord user id behind an access token.
 *
 * Only the id is returned. The flow requests the `identify email` scopes, so
 * the response also carries the account's email and profile; none of it is
 * stored, and pulling out one field here is what keeps it that way.
 *
 * @param accessToken - From {@link exchangeDiscordCode}.
 * @throws {DiscordOAuthError} Discord rejected the token or was unreachable.
 */
export async function fetchDiscordUserId(accessToken: string): Promise<string> {
  const res = await withTimeout(`${DISCORD_API_BASE_URL}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new DiscordOAuthError(`Discord user lookup failed (${res.status})`)
  }

  const body = (await res.json()) as { id?: unknown }
  if (typeof body.id !== 'string' || !body.id) {
    throw new DiscordOAuthError('Discord returned no user id')
  }
  return body.id
}
