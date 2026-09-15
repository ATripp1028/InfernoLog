import { describe, expect, it } from 'vitest'
import { maskEmail } from '../maskEmail'

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('sp0rk@proton.me')).toBe('s••••@proton.me')
    expect(maskEmail('a@b.co')).toBe('a••••@b.co')
  })

  it('masks a value that is not an address whole', () => {
    expect(maskEmail('not-an-email')).toBe('••••')
    expect(maskEmail('@b.co')).toBe('••••')
  })
})
