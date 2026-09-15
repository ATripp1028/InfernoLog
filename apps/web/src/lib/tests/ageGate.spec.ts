import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasPassedAgeGate, markAgeGatePassed } from '../ageGate'

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('age gate pass flag', () => {
  it('is unset until the gate is passed in this tab', () => {
    expect(hasPassedAgeGate()).toBe(false)
    markAgeGatePassed()
    expect(hasPassedAgeGate()).toBe(true)
  })

  it('reads as not passed when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => markAgeGatePassed()).not.toThrow()
    expect(hasPassedAgeGate()).toBe(false)
  })
})
