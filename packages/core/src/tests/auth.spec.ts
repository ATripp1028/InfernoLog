import { describe, expect, it } from 'vitest'
import {
  PasswordSignupStartSchema,
  PasswordSignupVerifySchema,
  VerificationCodeSchema,
} from '../auth'

// `Leak-Canary-` is allowlisted in .gitleaks.toml.
const PASSWORD = 'Leak-Canary-Pa55'

describe('VerificationCodeSchema', () => {
  it('accepts six digits, trimming surrounding space', () => {
    expect(VerificationCodeSchema.parse(' 048213 ')).toBe('048213')
  })

  it('rejects anything else without echoing it', () => {
    for (const bad of ['12345', '1234567', '12a456', '']) {
      const result = VerificationCodeSchema.safeParse(bad)
      expect(result.success, bad).toBe(false)
      if (!result.success && bad) {
        expect(JSON.stringify(result.error.issues)).not.toContain(bad)
      }
    }
  })
})

describe('PasswordSignupStartSchema', () => {
  it('normalizes the email', () => {
    expect(PasswordSignupStartSchema.parse({ email: ' A@B.co ' })).toEqual({
      email: 'a@b.co',
    })
  })
})

describe('PasswordSignupVerifySchema', () => {
  it('accepts a complete body', () => {
    expect(
      PasswordSignupVerifySchema.parse({
        email: 'A@b.co',
        verificationCode: '123456',
        password: PASSWORD,
      })
    ).toEqual({
      email: 'a@b.co',
      verificationCode: '123456',
      password: PASSWORD,
    })
  })

  it('rejects a password that breaks the policy', () => {
    expect(
      PasswordSignupVerifySchema.safeParse({
        email: 'a@b.co',
        verificationCode: '123456',
        password: 'short',
      }).success
    ).toBe(false)
  })
})
