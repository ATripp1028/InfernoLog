// Verifying a Google re-confirmation ("proof") sent by the browser.
//
// The browser gets the proof by signing in with Google through the Cognito
// hosted UI in its own PKCE flow (web `lib/googleProof.ts`), outside Amplify,
// so the account's existing session is untouched and the proof arrives on a
// request carrying that session's JWT. The proof is a Cognito ID token for the
// Google identity. It is verified here rather than by API Gateway because it
// travels in the body, not the Authorization header.
//
// What a valid proof establishes: this Cognito user signed in with Google at
// most PROOF_MAX_AGE_SECONDS ago. If the browser still has a Google session,
// Google may sign it in without asking for anything — accepted as sufficient
// (a live Google session is the re-confirmation).
//
// What it does not establish on its own: which InfernoLog account it is for.
// Each caller checks that against the authenticated account itself.

import { CognitoJwtVerifier } from 'aws-jwt-verify'

/** How recently the Google sign-in must have happened. */
export const PROOF_MAX_AGE_SECONDS = 5 * 60

/** Why a proof was refused. Carries no part of the token. */
export class GoogleProofError extends Error {
  constructor(
    readonly reason: 'invalid' | 'not-google' | 'stale' | 'no-email'
  ) {
    super(`Google proof refused (${reason})`)
    this.name = 'GoogleProofError'
  }
}

/** What a verified proof says about its Google identity. */
export interface VerifiedGoogleProof {
  /** The Google identity's Cognito sub — what `AuthIdentity.cognitoSub` holds. */
  cognitoSub: string
  /** The email Google asserted, lowercased. */
  email: string
}

type Verifier = { verify: (token: string) => Promise<Record<string, unknown>> }
let cached: { key: string; verifier: Verifier } | undefined

function verifier(): Verifier {
  const userPoolId = process.env.COGNITO_USER_POOL_ID
  const clientId = process.env.COGNITO_CLIENT_ID
  if (!userPoolId || !clientId) {
    throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set')
  }
  const key = `${userPoolId}:${clientId}`
  if (cached?.key !== key) {
    cached = {
      key,
      // Checks signature against the pool's JWKS, issuer, expiry, token_use
      // and audience (the web client, which is who ran the flow).
      verifier: CognitoJwtVerifier.create({
        userPoolId,
        tokenUse: 'id',
        clientId,
      }) as unknown as Verifier,
    }
  }
  return cached.verifier
}

function isGoogle(identities: unknown): boolean {
  return (
    Array.isArray(identities) &&
    identities.some(
      (identity: unknown) =>
        typeof identity === 'object' &&
        identity !== null &&
        String(
          (identity as { providerName?: unknown }).providerName
        ).toLowerCase() === 'google'
    )
  )
}

/**
 * Verifies a Google re-confirmation.
 *
 * @param token - The Cognito ID token the browser obtained.
 * @param nowMs - The current time, for tests.
 * @returns The Google identity it proves.
 * @throws {GoogleProofError} When the token is invalid, not a Google identity,
 *   has no email, or is older than {@link PROOF_MAX_AGE_SECONDS}.
 */
export async function verifyGoogleProof(
  token: string,
  nowMs: number = Date.now()
): Promise<VerifiedGoogleProof> {
  // Outside the try: a missing configuration is a server fault, not a bad proof.
  const tokenVerifier = verifier()
  let payload: Record<string, unknown>
  try {
    payload = await tokenVerifier.verify(token)
  } catch {
    throw new GoogleProofError('invalid')
  }

  if (!isGoogle(payload.identities)) throw new GoogleProofError('not-google')

  const authTime = payload.auth_time
  if (
    typeof authTime !== 'number' ||
    nowMs / 1000 - authTime > PROOF_MAX_AGE_SECONDS
  ) {
    throw new GoogleProofError('stale')
  }

  const sub = payload.sub
  const email = payload.email
  if (typeof sub !== 'string' || typeof email !== 'string' || !email) {
    throw new GoogleProofError('no-email')
  }
  return { cognitoSub: sub, email: email.toLowerCase() }
}
