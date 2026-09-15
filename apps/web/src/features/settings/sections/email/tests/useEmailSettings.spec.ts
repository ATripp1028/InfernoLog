import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { storeGoogleProof } from '@/lib/googleProof'
import { makeMe } from '@/utils/testUtils'
import { useEmailSettings } from '../useEmailSettings'

const me = makeMe({ email: 'sp0rk@proton.me' })

beforeEach(() => sessionStorage.clear())

describe('useEmailSettings', () => {
  it('masks the email unless emails are shown', () => {
    expect(
      renderHook(() => useEmailSettings(me, false)).result.current
        .displayedEmail
    ).toBe('s••••@proton.me')
    expect(
      renderHook(() => useEmailSettings(me, true)).result.current.displayedEmail
    ).toBe('sp0rk@proton.me')
  })

  it('opens and closes the dialog', () => {
    const { result } = renderHook(() => useEmailSettings(me, false))
    expect(result.current.open).toBe(false)
    act(() => result.current.openDialog())
    expect(result.current.open).toBe(true)
    act(() => result.current.closeDialog())
    expect(result.current.open).toBe(false)
  })

  it('reopens the dialog on returning from a Google re-confirmation for it', () => {
    storeGoogleProof('email-change', 'proof-token')
    expect(
      renderHook(() => useEmailSettings(me, false)).result.current.open
    ).toBe(true)
  })
})
