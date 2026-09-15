// Where a freshly signed-in email-and-password user goes next.

import type { MeData } from '@/lib/api/me'
import { ApiError, apiFetch } from '@/lib/api/client'
import { signupStart } from '@/lib/api/authOnboarding'

/** A route an email-and-password sign-in can land on. */
export type SignInDestination = '/log' | '/onboarding'

/**
 * Decides where a just-signed-in user goes, finishing their signup first if it
 * never finished.
 *
 * A native Cognito user with no InfernoLog account is a signup that verified
 * its email and set a password but never reached POST /v1/auth/signup/start —
 * the tab closed in between. It passed the age gate to get that far, so the
 * account is created now rather than the sign-in being refused, which is what
 * a Google sign-in with no account gets instead (AuthCallback).
 *
 * @param token - The new session's ID token.
 * @throws {ApiError} 409 `ACCOUNT_EXISTS` when that unfinished signup's email
 *   has since become another account's; the API has already discarded it.
 */
export async function destinationAfterSignIn(
  token: string
): Promise<SignInDestination> {
  try {
    const { data } = await apiFetch<{ data: MeData }>('/v1/me', {
      token,
      method: 'GET',
    })
    return data.onboardingCompleted ? '/log' : '/onboarding'
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
  }
  const { onboardingCompleted } = await signupStart(token)
  return onboardingCompleted ? '/log' : '/onboarding'
}
