import { describe, expect, it } from 'vitest'
import { isEmailVerified, signupProviderFromClaims } from './identityClaims'

const base = { sub: 'sub-1', email: 'a@b.co' }

describe('isEmailVerified', () => {
  it.each([
    ['the string API Gateway sends', 'true', true],
    ['a real boolean', true, true],
    ['false', 'false', false],
    ['an unexpected value', 'yes', false],
    ['absent', undefined, false],
  ])('%s', (_label, value, expected) => {
    expect(
      isEmailVerified({
        ...base,
        ...(value === undefined ? {} : { email_verified: value }),
      })
    ).toBe(expected)
  })
})

describe('signupProviderFromClaims', () => {
  it('reads a token with no identities as a native password user', () => {
    expect(signupProviderFromClaims(base)).toBe('PASSWORD')
    expect(signupProviderFromClaims({ ...base, identities: '' })).toBe(
      'PASSWORD'
    )
  })

  it.each([
    [
      'JSON, as a string',
      '[{"userId":"1","providerName":"Google","providerType":"Google"}]',
    ],
    [
      "Go's map formatting, as a string",
      '[map[dateCreated:1700000000000 providerName:Google providerType:Google userId:1]]',
    ],
    ['a real array', [{ providerName: 'Google' }]],
  ])('reads Google from %s', (_label, identities) => {
    expect(signupProviderFromClaims({ ...base, identities })).toBe('GOOGLE')
  })

  it('refuses a federated provider it does not support', () => {
    expect(
      signupProviderFromClaims({
        ...base,
        identities: '[{"providerName":"SignInWithApple"}]',
      })
    ).toBeNull()
    expect(
      signupProviderFromClaims({ ...base, identities: '[{"nothing":1}]' })
    ).toBeNull()
  })
})
