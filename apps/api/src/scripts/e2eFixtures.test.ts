/**
 * The E2E scripts' blast-radius guard. The scripts delete the E2E user's data,
 * so the guard is the only thing standing between a mistyped environment and a
 * real account — worth a test even though scripts are otherwise run by hand.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { isReservedTestDomain, requireE2eEmail } from './e2eFixtures'

afterEach(() => vi.unstubAllEnvs())

describe('isReservedTestDomain', () => {
  it.each([
    'e2e+staging@example.com',
    'e2e+x@example.net',
    'e2e+x@example.org',
    'e2e+x@infernolog.test',
    'e2e+x@foo.example',
    'e2e+x@nowhere.invalid',
  ])('accepts %s', (email) => {
    expect(isReservedTestDomain(email)).toBe(true)
  })

  it.each([
    'e2e+me@gmail.com',
    'e2e+x@example.com.attacker.io',
    'e2e+x@notexample.com',
    'e2e+x@test.com',
  ])('refuses %s', (email) => {
    expect(isReservedTestDomain(email)).toBe(false)
  })
})

describe('requireE2eEmail', () => {
  it('returns a lowercased address that passes both checks', () => {
    vi.stubEnv('E2E_USER_EMAIL', ' E2E+Staging@Example.com ')
    expect(requireE2eEmail()).toBe('e2e+staging@example.com')
  })

  it.each([
    ['missing', '', /required/],
    ['outside the e2e+ namespace', 'staging@example.com', /Refusing/],
    ['a registrable domain', 'e2e+staging@gmail.com', /Refusing/],
  ])('refuses an address that is %s', (_label, value, message) => {
    vi.stubEnv('E2E_USER_EMAIL', value)
    expect(() => requireE2eEmail()).toThrow(message)
  })
})
