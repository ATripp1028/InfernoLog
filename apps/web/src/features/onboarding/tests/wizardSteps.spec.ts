import { describe, expect, it } from 'vitest'
import {
  STEPS,
  STEP_LABELS,
  initialStep,
  isPlaceholderUsername,
  nextStep,
} from '../wizardSteps'

// The signup trigger seeds `<email-localpart>_<8 hex chars>`. This decides
// whether a returning user still owes the Username step.
describe('isPlaceholderUsername', () => {
  it('recognizes the seeded placeholder', () => {
    expect(isPlaceholderUsername('alex_1a2b3c4d', 'alex@example.com')).toBe(
      true
    )
  })

  it('recognizes it for any 8 hex characters', () => {
    expect(isPlaceholderUsername('alex_00000000', 'alex@example.com')).toBe(
      true
    )
    expect(isPlaceholderUsername('alex_ffffffff', 'alex@example.com')).toBe(
      true
    )
  })

  it('rejects a username the user actually chose', () => {
    expect(isPlaceholderUsername('alextripp', 'alex@example.com')).toBe(false)
  })

  it('rejects a chosen name that merely starts the same way', () => {
    expect(isPlaceholderUsername('alex_thegreat', 'alex@example.com')).toBe(
      false
    )
  })

  it.each([
    ['too few hex characters', 'alex_1a2b3c4'],
    ['too many', 'alex_1a2b3c4d5'],
    ['non-hex characters', 'alex_zzzzzzzz'],
    ['uppercase hex', 'alex_1A2B3C4D'],
    ['no suffix at all', 'alex'],
  ])('rejects a name with %s', (_label, username) => {
    expect(isPlaceholderUsername(username, 'alex@example.com')).toBe(false)
  })

  it('rejects a placeholder built from a different email', () => {
    expect(isPlaceholderUsername('alex_1a2b3c4d', 'sam@example.com')).toBe(
      false
    )
  })

  // Email local-parts legitimately contain regex metacharacters, which are
  // escaped rather than interpreted — otherwise `a.b@x.com` would match
  // `axb_1a2b3c4d`, and a `+` would make the pattern throw.
  it.each([
    ['a dot', 'alex.tripp@example.com', 'alex.tripp_1a2b3c4d'],
    ['a plus', 'alex+gd@example.com', 'alex+gd_1a2b3c4d'],
    ['brackets', 'a[b]@example.com', 'a[b]_1a2b3c4d'],
  ])('handles a local-part containing %s', (_label, email, username) => {
    expect(isPlaceholderUsername(username, email)).toBe(true)
  })

  it('does not let a dot in the local-part match any character', () => {
    expect(
      isPlaceholderUsername('alexXtripp_1a2b3c4d', 'alex.tripp@x.com')
    ).toBe(false)
  })

  it('does not throw on an email with no local-part at all', () => {
    expect(() => isPlaceholderUsername('anything', '')).not.toThrow()
  })
})

describe('initialStep', () => {
  const user = (
    overrides: Partial<Parameters<typeof initialStep>[0]> = {}
  ) => ({
    legalAcceptedAt: '2026-01-01T00:00:00.000Z',
    username: 'alextripp',
    email: 'alex@example.com',
    ...overrides,
  })

  // Terms come first, whatever else is or is not done.
  it('starts at the terms for someone who has not accepted them', () => {
    expect(initialStep(user({ legalAcceptedAt: null }))).toBe('legal')
  })

  it('asks for terms even when the username is already chosen', () => {
    expect(
      initialStep(user({ legalAcceptedAt: null, username: 'alextripp' }))
    ).toBe('legal')
  })

  // A tab closed mid-wizard resumes rather than redoing completed steps.
  it('resumes at the username step while it is still the placeholder', () => {
    expect(initialStep(user({ username: 'alex_1a2b3c4d' }))).toBe('username')
  })

  it('skips past both once terms and username are done', () => {
    expect(initialStep(user())).toBe('logging')
  })

  it('only ever resumes at one of the first three steps', () => {
    const steps = [
      initialStep(user({ legalAcceptedAt: null })),
      initialStep(user({ username: 'alex_1a2b3c4d' })),
      initialStep(user()),
    ]

    expect(steps).toEqual(['legal', 'username', 'logging'])
  })
})

describe('nextStep', () => {
  it('advances through the wizard in order', () => {
    expect(nextStep('legal')).toBe('username')
    expect(nextStep('username')).toBe('logging')
    expect(nextStep('logging')).toBe('rating')
    expect(nextStep('rating')).toBe('import')
    expect(nextStep('import')).toBe('gddl')
  })

  // Null is what tells the wizard to finish and mark onboarding complete.
  it('reports nothing after the last step', () => {
    expect(nextStep('gddl')).toBeNull()
  })

  it('walks the whole sequence from the first step', () => {
    const visited: string[] = ['legal']
    let step = nextStep('legal')
    while (step) {
      visited.push(step)
      step = nextStep(step)
    }

    expect(visited).toEqual([...STEPS])
  })
})

describe('the step table', () => {
  it('declares each step exactly once', () => {
    expect(new Set(STEPS).size).toBe(STEPS.length)
  })

  it('labels every step', () => {
    for (const step of STEPS) {
      expect(STEP_LABELS[step]).toBeTruthy()
    }
  })

  it('labels nothing that is not a step', () => {
    expect(Object.keys(STEP_LABELS).sort()).toEqual([...STEPS].sort())
  })

  it('starts at the terms', () => {
    expect(STEPS[0]).toBe('legal')
  })
})
