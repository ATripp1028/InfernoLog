import { beforeEach, describe, expect, it } from 'vitest'
import { clearAuthNotice, peekAuthNotice, setAuthNotice } from '../authNotice'

beforeEach(() => sessionStorage.clear())

describe('auth notices', () => {
  it('carries a notice until it is cleared', () => {
    setAuthNotice('password-reset')
    expect(peekAuthNotice()).toBe('password-reset')
    expect(peekAuthNotice()).toBe('password-reset')
    clearAuthNotice()
    expect(peekAuthNotice()).toBeNull()
  })

  it('ignores a value it did not write', () => {
    sessionStorage.setItem('il_auth_notice', 'something-else')
    expect(peekAuthNotice()).toBeNull()
  })
})
