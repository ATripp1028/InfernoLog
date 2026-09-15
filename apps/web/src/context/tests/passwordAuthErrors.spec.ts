import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import {
  PASSWORD_AUTH_ERROR_MESSAGES,
  passwordAuthErrorKind,
  passwordAuthErrorMessage,
} from '../passwordAuthErrors'

const amplify = (name: string, message = '') => ({ name, message })

describe('passwordAuthErrorKind', () => {
  it.each([
    [
      'a wrong password',
      amplify('NotAuthorizedException', 'Incorrect username or password.'),
      'invalid-credentials',
    ],
    [
      'an unknown email',
      amplify('UserNotFoundException'),
      'invalid-credentials',
    ],
    [
      'the lockout after repeated failures',
      amplify('NotAuthorizedException', 'Password attempts exceeded'),
      'too-many-attempts',
    ],
    ['a wrong reset code', amplify('CodeMismatchException'), 'invalid-code'],
    ['an expired reset code', amplify('ExpiredCodeException'), 'invalid-code'],
    [
      'a password Cognito refuses',
      amplify('InvalidPasswordException'),
      'password-policy',
    ],
    [
      'Cognito throttling',
      amplify('LimitExceededException'),
      'too-many-attempts',
    ],
    ['a network failure', amplify('NetworkError'), 'network'],
    ['a failed fetch', new TypeError('Failed to fetch'), 'network'],
    ['anything else', new Error('boom'), 'unknown'],
    ['a non-object', 'nope', 'unknown'],
  ])('reads %s', (_label, error, kind) => {
    expect(passwordAuthErrorKind(error)).toBe(kind)
  })

  it.each([
    ['INVALID_CODE', 400, 'invalid-code'],
    ['RATE_LIMITED', 429, 'rate-limited'],
    ['ACCOUNT_EXISTS', 409, 'account-exists'],
  ])('reads the API code %s', (code, status, kind) => {
    expect(
      passwordAuthErrorKind(new ApiError(status, 'x', { error: 'x', code }))
    ).toBe(kind)
  })

  it('treats an uncoded 429 as rate limiting and other API errors as unknown', () => {
    expect(passwordAuthErrorKind(new ApiError(429, 'x'))).toBe('rate-limited')
    expect(passwordAuthErrorKind(new ApiError(500, 'x'))).toBe('unknown')
  })

  // An unknown email and a wrong password must read the same, or the form
  // tells a stranger which addresses have accounts.
  it('gives an unknown email and a wrong password the same message', () => {
    expect(passwordAuthErrorMessage(amplify('UserNotFoundException'))).toBe(
      passwordAuthErrorMessage(amplify('NotAuthorizedException'))
    )
    expect(PASSWORD_AUTH_ERROR_MESSAGES['invalid-credentials']).toBe(
      'Incorrect email or password.'
    )
  })
})
