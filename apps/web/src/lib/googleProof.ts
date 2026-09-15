// A Google re-confirmation ("proof") for Settings, obtained outside Amplify.
//
// Settings needs proof that the person at the keyboard controls a Google
// account right now — to connect one, or to add a password. Amplify's
// signInWithRedirect can't provide it: it refuses to run while a session
// exists, and signing out first would swap the account's session for the
// Google one, so the API request that uses the proof would no longer carry the
// account's JWT. So this runs its own OAuth authorization-code flow with PKCE
// against the Cognito hosted UI (identity_provider=Google), returning to
// /auth/google-proof, a path Amplify doesn't watch. The account's Amplify
// session is never touched.
//
// The resulting Cognito ID token is the proof. The API verifies it (signature,
// audience, Google provider, signed in within 5 minutes) and checks it against
// the account itself (apps/api/src/utils/googleProof.ts). The refresh token
// from the exchange is revoked immediately; nothing but the ID token is kept.
//
// ⚠️ The ID token sits in sessionStorage between the callback and its use, for
// at most PROOF_TTL_MS, and is removed once used. It is a bearer token for the
// Google identity until it expires, so it is never logged and never put
// anywhere else.

const PENDING_KEY = 'il_google_proof_pending'
const PROOF_KEY = 'il_google_proof'
const CALLBACK_PATH = '/auth/google-proof'

/**
 * How long a stored proof is offered back. A little under the API's 5-minute
 * limit, so a proof the page shows as usable is never refused as stale.
 */
export const PROOF_TTL_MS = 4.5 * 60 * 1000

/** What a re-confirmation is for, which decides where the callback goes next. */
export type GoogleProofPurpose =
  | 'connect-google'
  | 'password-setup'
  | 'email-change'

interface Pending {
  purpose: GoogleProofPurpose
  state: string
  verifier: string
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  )
  return base64Url(new Uint8Array(digest))
}

function hostedUi(path: string): string {
  return `https://${import.meta.env.VITE_COGNITO_DOMAIN}${path}`
}

function redirectUri(): string {
  return `${window.location.origin}${CALLBACK_PATH}`
}

/**
 * Builds the hosted-UI URL that signs in with Google and returns to
 * /auth/google-proof, recording the PKCE verifier and state for the callback.
 *
 * @param purpose - What the proof will be used for.
 */
export async function buildGoogleProofUrl(
  purpose: GoogleProofPurpose
): Promise<string> {
  const pending: Pending = {
    purpose,
    state: randomString(16),
    verifier: randomString(32),
  }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))

  const params = new URLSearchParams({
    identity_provider: 'Google',
    response_type: 'code',
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: 'openid email',
    state: pending.state,
    code_challenge: await challengeFor(pending.verifier),
    code_challenge_method: 'S256',
  })
  return hostedUi(`/oauth2/authorize?${params.toString()}`)
}

/**
 * Leaves for Google to re-confirm.
 *
 * @param purpose - What the proof will be used for.
 */
export async function startGoogleProof(
  purpose: GoogleProofPurpose
): Promise<void> {
  window.location.assign(await buildGoogleProofUrl(purpose))
}

/** Why a re-confirmation didn't produce a proof. */
export class GoogleProofFlowError extends Error {
  constructor(
    readonly reason: 'cancelled' | 'invalid-state' | 'exchange-failed'
  ) {
    super(`Google re-confirmation failed (${reason})`)
    this.name = 'GoogleProofFlowError'
  }
}

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString()
}

/**
 * Finishes a re-confirmation on /auth/google-proof: checks the state, exchanges
 * the code with its PKCE verifier, and revokes the refresh token.
 *
 * Single use: the pending record is removed first, so a reload or a replayed
 * callback URL cannot complete it twice.
 *
 * @param search - The callback URL's query parameters.
 * @returns The purpose recorded at the start, and the ID token.
 * @throws {GoogleProofFlowError} When the user backed out, the state doesn't
 *   match, or the exchange fails.
 */
export async function completeGoogleProof(
  search: URLSearchParams
): Promise<{ purpose: GoogleProofPurpose; idToken: string }> {
  const raw = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)

  if (search.get('error')) throw new GoogleProofFlowError('cancelled')
  const pending = raw ? (JSON.parse(raw) as Pending) : null
  const code = search.get('code')
  if (!pending || !code || search.get('state') !== pending.state) {
    throw new GoogleProofFlowError('invalid-state')
  }

  const response = await fetch(hostedUi('/oauth2/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'authorization_code',
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: pending.verifier,
    }),
  })
  if (!response.ok) throw new GoogleProofFlowError('exchange-failed')
  const tokens = (await response.json()) as {
    id_token?: string
    refresh_token?: string
  }
  if (!tokens.id_token) throw new GoogleProofFlowError('exchange-failed')

  // Only the ID token is needed. The refresh token would keep a second session
  // alive for this Google identity, so it is revoked straight away — best
  // effort, since the proof is valid either way.
  if (tokens.refresh_token) {
    void fetch(hostedUi('/oauth2/revoke'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        token: tokens.refresh_token,
        client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      }),
    }).catch(() => undefined)
  }

  return { purpose: pending.purpose, idToken: tokens.id_token }
}

/**
 * Keeps a proof until the page that needs it uses it.
 *
 * @param purpose - What it is for; only that page reads it back.
 * @param idToken - The proof.
 */
export function storeGoogleProof(
  purpose: GoogleProofPurpose,
  idToken: string
): void {
  sessionStorage.setItem(
    PROOF_KEY,
    JSON.stringify({ purpose, idToken, obtainedAt: Date.now() })
  )
}

/**
 * The stored proof for a purpose while it is still fresh, without removing it;
 * a stale one is removed. Call {@link clearGoogleProof} once it has been used.
 *
 * @param purpose - What the caller needs a proof for.
 * @param now - The current time, for tests.
 */
export function peekGoogleProof(
  purpose: GoogleProofPurpose,
  now: number = Date.now()
): string | null {
  const raw = sessionStorage.getItem(PROOF_KEY)
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as {
      purpose: GoogleProofPurpose
      idToken: string
      obtainedAt: number
    }
    if (now - stored.obtainedAt > PROOF_TTL_MS) {
      clearGoogleProof()
      return null
    }
    return stored.purpose === purpose ? stored.idToken : null
  } catch {
    clearGoogleProof()
    return null
  }
}

/** Removes a stored proof once used, or when the flow is abandoned. */
export function clearGoogleProof(): void {
  sessionStorage.removeItem(PROOF_KEY)
}
