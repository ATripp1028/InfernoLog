// Builds the Playwright `storageState` that makes the app boot already
// signed in, in the localStorage shape Amplify's token store reads.
//
// ⚠️ This is an internal Amplify detail, not a public API. It is verified
// against aws-amplify 6.16.4 (@aws-amplify/auth 6.19.1):
// `providers/cognito/tokenProvider/TokenStore` derives every key as
// `CognitoIdentityServiceProvider.<clientId>.<lastAuthUser>.<key>`, with
// `LastAuthUser` itself at `CognitoIdentityServiceProvider.<clientId>.LastAuthUser`.
//
// Treat an Amplify major upgrade as something that breaks this suite. If the
// format churns, the fallback is to have globalSetup drive a real
// `signIn({ username, password })` in a page context and snapshot whatever
// storage Amplify produces — slower, but self-correcting across versions.

const AUTH_KEY_PREFIX = 'CognitoIdentityServiceProvider'

/** The token triple `AdminInitiateAuth` returns. */
export interface CognitoTokens {
  idToken: string
  accessToken: string
  refreshToken: string
}

interface StorageEntry {
  name: string
  value: string
}

/** Playwright's `storageState` shape, narrowed to what this suite writes. */
export interface StorageState {
  cookies: never[]
  origins: { origin: string; localStorage: StorageEntry[] }[]
}

/**
 * The `sub`/`cognito:username` claims of a Cognito JWT.
 *
 * Signature verification is deliberately skipped: this token was just minted
 * by an authenticated `AdminInitiateAuth` call, and the API Gateway authorizer
 * is what actually validates it. Decoding here only picks the storage key.
 */
export function decodeJwtClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Malformed JWT: no payload segment.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

/**
 * The value Amplify stores as `LastAuthUser` and keys every token under.
 *
 * The pool uses email as its sign-in alias, so Cognito's own username is a
 * UUID rather than the address — `cognito:username` is that UUID, and using it
 * keeps `getCurrentUser()` returning what a real sign-in would have.
 */
export function lastAuthUserFrom(idToken: string): string {
  const claims = decodeJwtClaims(idToken)
  const username = claims['cognito:username'] ?? claims.sub
  if (typeof username !== 'string') {
    throw new Error('ID token carries neither cognito:username nor sub.')
  }
  return username
}

/**
 * Renders a signed-in session as a `storageState` for `origin`.
 *
 * `clockDrift` is written explicitly as "0" — the token store parses it with
 * `Number.parseInt` and a missing key defaults to "0" anyway, but leaving it
 * out makes the omission look accidental. `signInDetails` is deliberately not
 * written: nothing in the app reads it, and inventing one would be inventing
 * a shape Amplify owns.
 */
export function buildStorageState(
  origin: string,
  clientId: string,
  tokens: CognitoTokens
): StorageState {
  const user = lastAuthUserFrom(tokens.idToken)
  const key = (name: string) => `${AUTH_KEY_PREFIX}.${clientId}.${user}.${name}`

  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: `${AUTH_KEY_PREFIX}.${clientId}.LastAuthUser`, value: user },
          { name: key('idToken'), value: tokens.idToken },
          { name: key('accessToken'), value: tokens.accessToken },
          { name: key('refreshToken'), value: tokens.refreshToken },
          { name: key('clockDrift'), value: '0' },
        ],
      },
    ],
  }
}
