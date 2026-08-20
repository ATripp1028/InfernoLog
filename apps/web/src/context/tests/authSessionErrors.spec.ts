import { describe, expect, it } from 'vitest'
import { isTerminalAuthError } from '../authSessionErrors'

/** A rejection shaped the way Amplify's `AuthError` reaches a caller. */
const authError = (name: string) => ({ name, message: 'failed' })

describe('isTerminalAuthError', () => {
  it.each([
    'NotAuthorizedException',
    'TokenRevokedException',
    'UserNotFoundException',
    'PasswordResetRequiredException',
    'UserNotConfirmedException',
    'RefreshTokenReuseException',
  ])('ends the session on %s', (name) => {
    expect(isTerminalAuthError(authError(name))).toBe(true)
  })

  // Cognito appends its own message to the name, which is why Amplify matches
  // these by prefix rather than equality.
  it('matches a name the service has appended a message to', () => {
    const error = authError('NotAuthorizedException: Refresh Token has expired')

    expect(isTerminalAuthError(error)).toBe(true)
  })

  // The case the whole split exists for: Amplify keeps the still-valid tokens
  // on these and expects the call to be retried, so reporting one as a
  // sign-out strands a session that was never over.
  it.each([
    'NetworkError',
    'TooManyRequestsException',
    'InternalErrorException',
  ])('treats %s as a recoverable moment', (name) => {
    expect(isTerminalAuthError(authError(name))).toBe(false)
  })

  // An unrecognized failure is the transient case by default — the terminal
  // list is the closed one, because clearing a good session costs more than
  // retrying a dead one.
  it.each([
    ['an unnamed object', {}],
    ['undefined', undefined],
    ['null', null],
    ['a bare string', 'NotAuthorizedException'],
    ['a non-string name', { name: 404 }],
  ])('does not end the session on %s', (_label, value) => {
    expect(isTerminalAuthError(value)).toBe(false)
  })
})
