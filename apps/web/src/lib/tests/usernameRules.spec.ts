import { describe, expect, it } from 'vitest'
import { USERNAME_RESERVED } from '@infernolog/core'
import { COOLDOWN_DAYS, cooldownEnd, usernameError } from '../usernameRules'

describe('usernameError', () => {
  it.each(['ab', 'alextripp', 'a_b-c', 'A1', '_'.repeat(32)])(
    'accepts %s',
    (value) => {
      expect(usernameError(value)).toBeNull()
    }
  )

  it.each([
    ['a', 'at least 2'],
    ['', 'at least 2'],
    ['x'.repeat(33), 'at most 32'],
  ])('rejects %p for being %s characters', (value, phrase) => {
    expect(usernameError(value)).toContain(phrase)
  })

  it.each(['a'.repeat(2), 'a'.repeat(32)])(
    'accepts the boundary length %s',
    (value) => {
      expect(usernameError(value)).toBeNull()
    }
  )

  it.each(['bad name', 'has.dot', 'emoji💀', 'semi;colon', 'a+b'])(
    'rejects the disallowed characters in %p',
    (value) => {
      expect(usernameError(value)).toContain('letters, numbers')
    }
  )

  // The editor used to carry its own copy of the rules that omitted this, so
  // a Save fired before the debounced availability check returned would send
  // a reserved name to the server and take a rejection.
  it.each(USERNAME_RESERVED)('rejects the reserved name %s', (value) => {
    expect(usernameError(value)).toContain('reserved')
  })

  it.each(['Admin', 'MODERATOR', 'InfernoLog'])(
    'rejects the reserved name %s whatever its casing',
    (value) => {
      expect(usernameError(value)).toContain('reserved')
    }
  )

  it('allows a name that merely contains a reserved word', () => {
    expect(usernameError('admin_alex')).toBeNull()
  })

  // A ZodError's own `message` is a JSON dump of every issue, which would
  // render as a blob in the field's inline error.
  it('never surfaces a raw ZodError dump', () => {
    const message = usernameError('bad name!')!

    expect(message).not.toContain('{')
    expect(message).not.toContain('"code"')
  })

  // Multiple rules can fail at once; the field shows one line.
  it('reports a single message for a value failing several rules', () => {
    const message = usernameError('!')!

    expect(message.split('\n')).toHaveLength(1)
  })
})

describe('cooldownEnd', () => {
  const changedAt = '2026-03-01T00:00:00.000Z'
  const start = Date.parse(changedAt)
  const day = 24 * 60 * 60 * 1000

  it('reports the lock lifting a full cooldown after the change', () => {
    const end = cooldownEnd(changedAt, start)

    expect(end?.getTime()).toBe(start + COOLDOWN_DAYS * day)
  })

  it('still reports a lock one moment before it lifts', () => {
    const end = start + COOLDOWN_DAYS * day

    expect(cooldownEnd(changedAt, end - 1)).not.toBeNull()
  })

  // Null is what unlocks the editor, so the boundary decides whether the
  // user can rename on the exact day their cooldown ends.
  it('reports no lock the moment it lifts', () => {
    const end = start + COOLDOWN_DAYS * day

    expect(cooldownEnd(changedAt, end)).toBeNull()
  })

  it('reports no lock long afterwards', () => {
    expect(cooldownEnd(changedAt, start + 365 * day)).toBeNull()
  })

  // A user who has never renamed has no cooldown at all.
  it('reports no lock for a name that was never changed', () => {
    expect(cooldownEnd(null)).toBeNull()
  })

  it('reports no lock rather than an Invalid Date for an unparseable timestamp', () => {
    expect(cooldownEnd('not-a-date', start)).toBeNull()
  })
})
