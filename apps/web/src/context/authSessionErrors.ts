// Which Amplify auth failures actually end a session. Pure — AuthContext owns
// the state, this owns the classification.

/**
 * Cognito error names meaning the refresh token itself is finished, so the
 * only way forward is a new sign-in.
 *
 * Amplify draws this exact line internally, in
 * `TokenOrchestrator.isAuthenticationError`: on these it clears the stored
 * tokens, and on everything else — offline, DNS failure, a Cognito 5xx,
 * throttling — it deliberately keeps them so the call can be retried. What it
 * does *not* do is report the two differently. Both dispatch
 * `tokenRefresh_failure` and both reject `fetchAuthSession`, so a caller that
 * wants to tell a finished session from a bad moment has to re-derive the
 * split here.
 *
 * @see https://github.com/aws-amplify/amplify-js/issues/14534
 */
const TERMINAL_AUTH_ERRORS = [
  'NotAuthorizedException', // refresh token expired or otherwise invalid
  'TokenRevokedException', // revoked by an administrator
  'UserNotFoundException', // the user no longer exists
  'PasswordResetRequiredException',
  'UserNotConfirmedException',
  'RefreshTokenReuseException', // invalidated by rotation
]

/**
 * Whether a rejection from `fetchAuthSession` — or the error on a
 * `tokenRefresh_failure` event — means the visitor is genuinely signed out.
 *
 * `false` covers the transient half, where the tokens Amplify still holds are
 * good and the session is recoverable. That half is not an edge case: a
 * browser that unloads an idle tab reloads it on return, and tokens live an
 * hour, so the first read after a restore always needs the network — which is
 * exactly when a machine coming out of sleep does not have it yet. An
 * unrecognized failure is a bad moment, not a sign-out.
 *
 * Matches on prefix because Amplify does, and because these arrive with the
 * service's message appended to the name.
 */
export function isTerminalAuthError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null | undefined)?.name
  return (
    typeof name === 'string' &&
    TERMINAL_AUTH_ERRORS.some((terminal) => name.startsWith(terminal))
  )
}
