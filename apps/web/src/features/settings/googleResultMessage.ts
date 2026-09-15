// What Settings says when it comes back from a Google re-confirmation.

import { AuthErrorCode } from '@infernolog/core'

/**
 * The toast for a failed Google re-confirmation or connection.
 *
 * @param reason - From the callback: a flow failure (`cancelled`,
 *   `invalid-state`, `exchange-failed`) or the API's error code.
 */
export function googleErrorMessage(reason?: string): string {
  switch (reason) {
    case 'cancelled':
      return 'Google confirmation cancelled.'
    case 'invalid-state':
      return 'That Google confirmation expired or was started elsewhere. Please try again.'
    case 'exchange-failed':
      return 'Couldn’t confirm with Google. Please try again.'
    case AuthErrorCode.CONNECTED_ELSEWHERE:
      return 'That Google account is already connected to a different InfernoLog account.'
    case AuthErrorCode.ALREADY_CONNECTED:
      return 'A Google account is already connected. Remove it first to connect a different one.'
    case AuthErrorCode.REAUTH_REQUIRED:
      return 'That Google confirmation took too long. Please try again.'
    default:
      return 'Something went wrong connecting Google. Please try again.'
  }
}
