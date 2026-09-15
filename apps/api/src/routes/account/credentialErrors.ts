// The error → response mapping shared by the Settings routes that check a
// password, a Google proof, or an emailed code (password.ts, email.ts). One
// place, so the same failure reads the same on every route.

import { AuthErrorCode } from '@infernolog/core'
import type { DomainErrorMap } from '../../middleware/errors'
import { GoogleProofError } from '../../utils/googleProof'
import {
  CurrentPasswordIncorrectError,
  PasswordRejectedError,
  PasswordUserExistsError,
  TooManyPasswordAttemptsError,
} from '../../services/cognito/passwordUser'
import { VerificationRateLimitedError } from '../../services/verification'

/**
 * Maps the credential-checking failures to their responses. None of the
 * messages or codes carries anything the user sent.
 */
export const credentialErrorResponse: DomainErrorMap = (error, c) => {
  if (error instanceof CurrentPasswordIncorrectError) {
    return c.json(
      {
        error: "That's not your current password.",
        code: AuthErrorCode.CURRENT_PASSWORD_INCORRECT,
      },
      400
    )
  }
  if (error instanceof TooManyPasswordAttemptsError) {
    return c.json(
      {
        error: 'Too many attempts. Try again in a few minutes.',
        code: AuthErrorCode.TOO_MANY_ATTEMPTS,
      },
      429
    )
  }
  if (error instanceof GoogleProofError) {
    return c.json(
      {
        error: 'Confirm with Google again, then try once more.',
        code: AuthErrorCode.REAUTH_REQUIRED,
      },
      403
    )
  }
  if (error instanceof VerificationRateLimitedError) {
    return c.json(
      {
        error: 'Too many codes have been requested. Try again in an hour.',
        code: AuthErrorCode.RATE_LIMITED,
      },
      429
    )
  }
  if (error instanceof PasswordUserExistsError) {
    return c.json(
      {
        error: 'An account already uses this email.',
        code: AuthErrorCode.ACCOUNT_EXISTS,
      },
      409
    )
  }
  if (error instanceof PasswordRejectedError) {
    return c.json(
      { error: "That password doesn't meet the requirements." },
      400
    )
  }
  return undefined
}
