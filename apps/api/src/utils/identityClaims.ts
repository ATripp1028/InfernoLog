import type { AuthProvider } from '@prisma/client'
import type { JwtClaims } from '../middleware/auth'

/**
 * Whether a token's email is verified by the provider that issued it.
 *
 * Accepts the string form API Gateway flattens claims to and a real boolean,
 * and nothing else: an absent or malformed claim is unverified.
 *
 * @param claims - Verified claims from `getVerifiedClaims`.
 */
export function isEmailVerified(claims: JwtClaims): boolean {
  return claims.email_verified === true || claims.email_verified === 'true'
}

/**
 * Which sign-in method a signing-up token belongs to, read from the token.
 *
 * A native Cognito user (email and password) has no `identities` claim; a
 * federated one does, naming its provider. API Gateway flattens that array of
 * objects to a string whose exact shape is not documented (JSON, or Go's
 * `map[providerName:Google …]` formatting), so the provider name is matched
 * out of whichever form arrives rather than parsed as JSON.
 *
 * @param claims - Verified claims from `getVerifiedClaims`.
 * @returns The provider, or `null` for a federated provider InfernoLog does
 *   not support signing up with.
 */
export function signupProviderFromClaims(
  claims: JwtClaims
): Extract<AuthProvider, 'GOOGLE' | 'PASSWORD'> | null {
  const identities = claims.identities
  if (identities === undefined || identities === null || identities === '') {
    return 'PASSWORD'
  }
  const text =
    typeof identities === 'string' ? identities : JSON.stringify(identities)
  const match = /providerName\W+(\w+)/i.exec(text)
  return match?.[1]?.toLowerCase() === 'google' ? 'GOOGLE' : null
}
