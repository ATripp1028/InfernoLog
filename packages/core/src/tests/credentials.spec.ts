import { describe, expect, it } from 'vitest'
import {
  EmailSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_SYMBOLS,
  PasswordSchema,
  REDACTED,
  isSensitiveFieldName,
  passwordRuleResults,
  scrubBreadcrumb,
  scrubErrorEvent,
  scrubSensitiveFields,
} from '../credentials'

// Obviously fake values. The `Leak-Canary-` prefix is allowlisted in
// .gitleaks.toml, so fixtures like these never trip the secret scan.
const VALID = 'Leak-Canary-Pa55'

function unmet(password: string) {
  return passwordRuleResults(password)
    .filter((rule) => !rule.met)
    .map((rule) => rule.id)
}

describe('passwordRuleResults', () => {
  it('meets every rule for a password with each kind of character', () => {
    expect(unmet(VALID)).toEqual([])
  })

  it('lists every rule an empty password misses, in checklist order', () => {
    expect(unmet('')).toEqual([
      'length',
      'lowercase',
      'uppercase',
      'number',
      'symbol',
    ])
  })

  it('counts every character in Cognito’s symbol list', () => {
    for (const symbol of PASSWORD_SYMBOLS) {
      expect(unmet(`Abcdefg1${symbol}`), `symbol ${symbol}`).toEqual([])
    }
  })

  it('does not count characters Cognito does not treat as symbols', () => {
    for (const near of ['£', 'é', '€', '§', '😀', '\t']) {
      expect(unmet(`Abcdefg1${near}`), `near-miss ${near}`).toEqual(['symbol'])
    }
  })

  it('counts a space only between other characters', () => {
    expect(unmet('Abcd efg1')).toEqual([])
    expect(unmet(' Abcdefg1')).toEqual(['symbol'])
    expect(unmet('Abcdefg1 ')).toEqual(['symbol'])
  })

  it('treats accented letters as neither case, like Cognito', () => {
    expect(unmet('ÉÉÉÉéééé1!')).toEqual(['lowercase', 'uppercase'])
  })

  it('enforces both length bounds', () => {
    expect(unmet('Ab1!xyz')).toEqual(['length'])
    expect(unmet('Ab1!xyzw')).toEqual([])
    const longest = 'Ab1!' + 'x'.repeat(PASSWORD_MAX_LENGTH - 4)
    expect(unmet(longest)).toEqual([])
    expect(unmet(longest + 'x')).toEqual(['length'])
  })
})

describe('PasswordSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(PasswordSchema.safeParse(VALID).success).toBe(true)
  })

  it('names each unmet rule', () => {
    const result = PasswordSchema.safeParse('abc')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.map((issue) => issue.message)).toEqual([
      'Password must be at least 8 characters',
      'Password must include an uppercase letter',
      'Password must include a number',
      'Password must include a symbol',
    ])
  })

  it('rejects a leading or trailing space, which Cognito refuses', () => {
    const result = PasswordSchema.safeParse(` ${VALID}`)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.message).toBe(
      "Password can't start or end with a space"
    )
  })

  it('never echoes the password in an error', () => {
    const secret = 'Leak-Canary-no-digits'
    const result = PasswordSchema.safeParse(secret)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('rejects a non-string', () => {
    expect(PasswordSchema.safeParse(12345678).success).toBe(false)
  })
})

describe('EmailSchema', () => {
  it('trims and lowercases', () => {
    expect(EmailSchema.parse('  Sp0rk@Proton.ME ')).toBe('sp0rk@proton.me')
  })

  it('rejects something that is not an address', () => {
    expect(EmailSchema.safeParse('not-an-email').success).toBe(false)
  })

  it('rejects an address longer than 254 characters', () => {
    expect(EmailSchema.safeParse(`${'a'.repeat(250)}@x.io`).success).toBe(false)
  })
})

describe('isSensitiveFieldName', () => {
  it('matches the credential names and variants of them', () => {
    for (const name of [
      'password',
      'currentPassword',
      'newPassword',
      'confirmPassword',
      'passwordConfirmation',
      'verificationCode',
      'VERIFICATIONCODE',
    ]) {
      expect(isSensitiveFieldName(name), name).toBe(true)
    }
  })

  it('leaves ordinary fields alone, including a bare `code`', () => {
    for (const name of ['code', 'email', 'username', 'levelId', 'passage']) {
      expect(isSensitiveFieldName(name), name).toBe(false)
    }
  })
})

describe('scrubSensitiveFields', () => {
  it('redacts credential fields at any depth, in objects and arrays', () => {
    const input = {
      email: 'a@b.co',
      password: 'Leak-Canary-1',
      nested: { newPassword: 'Leak-Canary-2', keep: 1 },
      list: [{ verificationCode: 'Leak-Canary-3' }],
      code: 'P2002',
    }
    expect(scrubSensitiveFields(input)).toEqual({
      email: 'a@b.co',
      password: REDACTED,
      nested: { newPassword: REDACTED, keep: 1 },
      list: [{ verificationCode: REDACTED }],
      code: 'P2002',
    })
  })

  it('does not modify the original', () => {
    const input = { password: 'Leak-Canary-4' }
    scrubSensitiveFields(input)
    expect(input.password).toBe('Leak-Canary-4')
  })

  it('scrubs a JSON string body', () => {
    const body = JSON.stringify({ email: 'a@b.co', password: 'Leak-Canary-5' })
    expect(JSON.parse(scrubSensitiveFields(body))).toEqual({
      email: 'a@b.co',
      password: REDACTED,
    })
  })

  it('redacts a non-JSON string that mentions a credential field', () => {
    expect(scrubSensitiveFields('password=Leak-Canary-6&x=1')).toBe(REDACTED)
  })

  it('leaves unrelated strings and non-strings alone', () => {
    expect(scrubSensitiveFields('hello')).toBe('hello')
    // A JSON scalar that mentions a credential field holds no object to scrub
    // into, so it is redacted whole like any other such string.
    expect(scrubSensitiveFields('"password"')).toBe(REDACTED)
    expect(scrubSensitiveFields(42)).toBe(42)
    expect(scrubSensitiveFields(null)).toBe(null)
  })

  it('survives cycles and pathological depth', () => {
    const cyclic: Record<string, unknown> = { password: 'Leak-Canary-7' }
    cyclic.self = cyclic
    expect(scrubSensitiveFields(cyclic)).toEqual({
      password: REDACTED,
      self: '[Circular]',
    })

    let deep: Record<string, unknown> = { password: 'Leak-Canary-8' }
    for (let i = 0; i < 50; i++) deep = { child: deep }
    expect(JSON.stringify(scrubSensitiveFields(deep))).not.toContain(
      'Leak-Canary-8'
    )
  })
})

describe('scrubErrorEvent', () => {
  it('scrubs the request body, query string, extras, contexts and breadcrumbs', () => {
    const event = {
      message: 'Signup failed',
      request: {
        url: '/v1/auth/password-signup/verify',
        data: JSON.stringify({ email: 'a@b.co', password: 'Leak-Canary-A' }),
        query_string: { verificationCode: 'Leak-Canary-B' },
      },
      extra: { body: { newPassword: 'Leak-Canary-C' } },
      contexts: { form: { currentPassword: 'Leak-Canary-D' } },
      breadcrumbs: [
        { message: 'xhr', data: { verificationCode: 'Leak-Canary-E' } },
        { message: 'nav' },
      ],
    }
    const scrubbed = scrubErrorEvent(event)
    expect(JSON.stringify(scrubbed)).not.toMatch(/Leak-Canary-/)
    expect(scrubbed.message).toBe('Signup failed')
    expect(scrubbed.request.url).toBe('/v1/auth/password-signup/verify')
    expect(JSON.parse(scrubbed.request.data)).toEqual({
      email: 'a@b.co',
      password: REDACTED,
    })
    expect(scrubbed.breadcrumbs[1]).toEqual({ message: 'nav' })
  })

  it('passes an event with nothing to scrub through unchanged', () => {
    // Typed with an optional scrubbable field, as Sentry's own Event type is.
    const event: { message: string; extra?: Record<string, unknown> } = {
      message: 'boom',
    }
    expect(scrubErrorEvent(event)).toEqual(event)
    const noBody: { request: { url: string; data?: unknown } } = {
      request: { url: '/x' },
    }
    expect(scrubErrorEvent(noBody)).toEqual({ request: { url: '/x' } })
  })
})

describe('scrubBreadcrumb', () => {
  it('scrubs data and leaves a data-less breadcrumb as it is', () => {
    const crumb = { category: 'fetch', data: { password: 'Leak-Canary-F' } }
    expect(scrubBreadcrumb(crumb)).toEqual({
      category: 'fetch',
      data: { password: REDACTED },
    })
    const bare: { category: string; data?: Record<string, unknown> } = {
      category: 'ui.click',
    }
    expect(scrubBreadcrumb(bare)).toBe(bare)
  })
})
