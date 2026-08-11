import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllAppCookies } from '../cookies'
import {
  hasActiveAgeGateFailureCookie,
  setAgeGateFailureCookie,
} from '../ageGate'
import { getPresetCookie, setPresetCookie } from '../presetCookie'

/** Wipes every cookie jsdom is holding, app-owned or not. */
function clearJar() {
  for (const entry of document.cookie.split('; ')) {
    const name = entry.split('=')[0]
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  }
}

beforeEach(clearJar)

describe('the age-gate cooldown', () => {
  it('reports no cooldown for a fresh browser', () => {
    expect(hasActiveAgeGateFailureCookie()).toBe(false)
  })

  it('reports a cooldown once one is set', () => {
    setAgeGateFailureCookie()

    expect(hasActiveAgeGateFailureCookie()).toBe(true)
  })

  // Deliberately client-side only: InfernoLog never persists anything about
  // a visitor who has not signed up, which is the point of gating before
  // OAuth starts.
  it('stores nothing but a marker', () => {
    setAgeGateFailureCookie()

    expect(document.cookie).toContain('il_agegate_failed=1')
    expect(document.cookie).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('is not confused by an unrelated cookie', () => {
    document.cookie = 'something_else=1; path=/'

    expect(hasActiveAgeGateFailureCookie()).toBe(false)
  })

  // A cookie whose name merely ends with the marker's must not read as one.
  it('is not confused by a cookie with a similar name', () => {
    document.cookie = 'not_il_agegate_failed=1; path=/'

    expect(hasActiveAgeGateFailureCookie()).toBe(false)
  })
})

describe('the preset cookie', () => {
  it('remembers nothing for a user who has never chosen', () => {
    expect(getPresetCookie('user-1')).toBeNull()
  })

  it('round-trips a preset id', () => {
    setPresetCookie('user-1', 'preset-abc')

    expect(getPresetCookie('user-1')).toBe('preset-abc')
  })

  // The built-in default view is a real selection, distinct from no cookie —
  // otherwise a user who deliberately chose Default would have a preset
  // restored on their next visit.
  it('records the built-in default as its own value', () => {
    setPresetCookie('user-1', null)

    expect(getPresetCookie('user-1')).toBe('default')
  })

  // Keyed by user id so two accounts sharing a browser don't clobber each
  // other's choice.
  it('keeps two users’ choices apart', () => {
    setPresetCookie('user-1', 'preset-a')
    setPresetCookie('user-2', 'preset-b')

    expect(getPresetCookie('user-1')).toBe('preset-a')
    expect(getPresetCookie('user-2')).toBe('preset-b')
  })

  it('overwrites a previous choice for the same user', () => {
    setPresetCookie('user-1', 'preset-a')
    setPresetCookie('user-1', 'preset-b')

    expect(getPresetCookie('user-1')).toBe('preset-b')
  })

  it('reports nothing for a user with no cookie of their own', () => {
    setPresetCookie('user-1', 'preset-a')

    expect(getPresetCookie('user-2')).toBeNull()
  })

  // Preset ids are uuids today, but the value is encoded either way so a
  // future id containing a separator cannot corrupt the jar.
  it('survives a value containing cookie separators', () => {
    setPresetCookie('user-1', 'a;b=c d')

    expect(getPresetCookie('user-1')).toBe('a;b=c d')
  })
})

// Account deletion should leave nothing about the account behind locally.
describe('clearAllAppCookies', () => {
  it('deletes every app cookie', () => {
    setAgeGateFailureCookie()
    setPresetCookie('user-1', 'preset-a')

    clearAllAppCookies()

    expect(hasActiveAgeGateFailureCookie()).toBe(false)
    expect(getPresetCookie('user-1')).toBeNull()
  })

  it('leaves cookies InfernoLog did not set alone', () => {
    document.cookie = 'third_party=keep; path=/'
    setAgeGateFailureCookie()

    clearAllAppCookies()

    expect(document.cookie).toContain('third_party=keep')
  })

  it('does nothing to an empty jar', () => {
    expect(() => clearAllAppCookies()).not.toThrow()
  })

  it('clears every user’s preset, not just one', () => {
    setPresetCookie('user-1', 'a')
    setPresetCookie('user-2', 'b')

    clearAllAppCookies()

    expect(getPresetCookie('user-1')).toBeNull()
    expect(getPresetCookie('user-2')).toBeNull()
  })
})
