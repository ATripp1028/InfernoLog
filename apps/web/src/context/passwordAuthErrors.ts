// What went wrong in an email-and-password auth call, for the forms to show.
//
// Cognito (through Amplify) and the API both reject in their own shapes; this
// reduces either to one kind and one sentence. Pure, so the mapping is tested
// without rendering anything.
//
// ⚠️ CREDENTIALS — nothing here reads or keeps a password or code; it only
// inspects the error a call rejected with.

import { AuthErrorCode } from '@infernolog/core'
import { authErrorCode } from '@/lib/api/authOnboarding'
import { ApiError } from '@/lib/api/client'

/** A failure a password form knows how to explain. */
export type PasswordAuthErrorKind =
  | 'invalid-credentials'
  | 'too-many-attempts'
  | 'invalid-code'
  | 'password-policy'
  | 'rate-limited'
  | 'account-exists'
  | 'network'
  | 'unknown'

/** What each kind tells the user. */
export const PASSWORD_AUTH_ERROR_MESSAGES: Record<
  PasswordAuthErrorKind,
  string
> = {
  'invalid-credentials': 'Incorrect email or password.',
  'too-many-attempts': 'Too many attempts. Try again in a few minutes.',
  'invalid-code': 'That code is incorrect or has expired.',
  'password-policy': "That password doesn't meet the requirements.",
  'rate-limited': 'Too many codes have been requested. Try again in an hour.',
  'account-exists': 'An account already uses this email. Sign in instead.',
  network: "Couldn't reach InfernoLog. Check your connection and try again.",
  unknown: 'Something went wrong. Try again.',
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error
    ? String((error as { name: unknown }).name)
    : ''
}

function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message: unknown }).message)
    : ''
}

/**
 * Classifies a rejected sign-in, signup, or password-reset call.
 *
 * An unknown email and a wrong password are one kind: the pool's
 * `preventUserExistenceErrors` already makes Cognito say the same thing for
 * both, and the form must not undo that.
 *
 * @param error - What the Amplify or API call rejected with.
 */
export function passwordAuthErrorKind(error: unknown): PasswordAuthErrorKind {
  if (error instanceof ApiError) {
    switch (authErrorCode(error)) {
      case AuthErrorCode.INVALID_CODE:
        return 'invalid-code'
      case AuthErrorCode.RATE_LIMITED:
        return 'rate-limited'
      case AuthErrorCode.ACCOUNT_EXISTS:
        return 'account-exists'
    }
    return error.status === 429 ? 'rate-limited' : 'unknown'
  }

  switch (errorName(error)) {
    case 'NotAuthorizedException':
      // Cognito uses this one exception for a wrong password and for the
      // temporary lockout after repeated failures; only the message differs.
      return /attempts exceeded/i.test(errorMessage(error))
        ? 'too-many-attempts'
        : 'invalid-credentials'
    case 'UserNotFoundException':
      return 'invalid-credentials'
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      return 'invalid-code'
    case 'InvalidPasswordException':
      return 'password-policy'
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'too-many-attempts'
    case 'NetworkError':
      return 'network'
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return 'network'
  }
  return 'unknown'
}

/**
 * The sentence to show for a rejected auth call.
 *
 * @param error - What the Amplify or API call rejected with.
 */
export function passwordAuthErrorMessage(error: unknown): string {
  return PASSWORD_AUTH_ERROR_MESSAGES[passwordAuthErrorKind(error)]
}
