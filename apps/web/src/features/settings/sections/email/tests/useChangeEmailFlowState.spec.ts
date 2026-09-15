/**
 * Changing the account email. The API and the Google re-confirmation are
 * mocked.
 *
 * ⚠️ CREDENTIALS — also checks the current password and code never reach
 * browser storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ApiError } from '@/lib/api/client'
import type { AuthIdentity } from '@/lib/api/me'
import { expectNotInBrowserStorage, makeMe } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  verify: vi.fn(),
  startGoogleProof: vi.fn(),
  toastSuccess: vi.fn(),
  captureException: vi.fn(),
  onClose: vi.fn(),
}))

vi.mock('@/lib/api/me', () => ({
  useStartEmailChange: () => ({ mutateAsync: mocks.start, isPending: false }),
  useVerifyEmailChange: () => ({ mutateAsync: mocks.verify, isPending: false }),
}))
vi.mock('@/lib/googleProof', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/googleProof')>()),
  startGoogleProof: mocks.startGoogleProof,
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException },
}))

const { storeGoogleProof, peekGoogleProof } = await import('@/lib/googleProof')
const { useChangeEmailFlowState } = await import('../useChangeEmailFlowState')

const CURRENT = 'Leak-Canary-Pa55!email'
const CODE = '271828'

const identity = (provider: AuthIdentity['provider']): AuthIdentity => ({
  id: provider,
  provider,
  providerAccountId: null,
  email: 'player@example.com',
  canSignIn: true,
  createdAt: '2026-09-01T00:00:00.000Z',
})

const withPassword = makeMe({ identities: [identity('PASSWORD')] })
const googleOnly = makeMe({ identities: [identity('GOOGLE')] })

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.start.mockResolvedValue(undefined)
  mocks.verify.mockResolvedValue(undefined)
  mocks.startGoogleProof.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
})

describe('with a password', () => {
  it('sends the code with the current password, then changes the email and closes', async () => {
    const { result } = renderHook(() =>
      useChangeEmailFlowState(withPassword, mocks.onClose)
    )

    await act(() => result.current.submitDetails('new@example.com', CURRENT))
    expect(mocks.start).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      currentPassword: CURRENT,
    })
    expect(result.current.step).toBe('code')

    await act(() => result.current.resendCode())
    expect(mocks.start).toHaveBeenCalledTimes(2)

    await act(() => result.current.submitCode(CODE))
    expect(mocks.verify).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      verificationCode: CODE,
    })
    expect(mocks.onClose).toHaveBeenCalled()
    expectNotInBrowserStorage(CURRENT, CODE)
  })

  it('returns to details with a wrong current password', async () => {
    mocks.start.mockRejectedValue(
      new ApiError(400, 'x', { code: 'CURRENT_PASSWORD_INCORRECT' })
    )
    const { result } = renderHook(() =>
      useChangeEmailFlowState(withPassword, mocks.onClose)
    )

    await act(() => result.current.submitDetails('new@example.com', CURRENT))

    expect(result.current.step).toBe('details')
    expect(result.current.error).toMatch(/not your current password/)
    expectNotInBrowserStorage(CURRENT)
  })
})

describe('without a password', () => {
  it('asks for a Google re-confirmation, then uses the stored proof', async () => {
    const first = renderHook(() =>
      useChangeEmailFlowState(googleOnly, mocks.onClose)
    )
    expect(first.result.current.googleConfirmed).toBe(false)
    await act(() => first.result.current.reconfirm())
    expect(mocks.startGoogleProof).toHaveBeenCalledWith('email-change')

    storeGoogleProof('email-change', 'proof-token')
    const { result } = renderHook(() =>
      useChangeEmailFlowState(googleOnly, mocks.onClose)
    )
    expect(result.current.googleConfirmed).toBe(true)

    await act(() => result.current.submitDetails('new@example.com', ''))
    expect(mocks.start).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      googleProof: 'proof-token',
    })
    await act(() => result.current.submitCode(CODE))
    expect(peekGoogleProof('email-change')).toBeNull()
  })

  it('drops a stale proof and asks again', async () => {
    storeGoogleProof('email-change', 'proof-token')
    mocks.start.mockRejectedValue(
      new ApiError(403, 'x', { code: 'REAUTH_REQUIRED' })
    )
    const { result } = renderHook(() =>
      useChangeEmailFlowState(googleOnly, mocks.onClose)
    )

    await act(() => result.current.submitDetails('new@example.com', ''))

    expect(result.current.googleConfirmed).toBe(false)
    expect(peekGoogleProof('email-change')).toBeNull()
  })

  it('explains a re-confirmation that could not start', async () => {
    mocks.startGoogleProof.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() =>
      useChangeEmailFlowState(googleOnly, mocks.onClose)
    )
    await act(() => result.current.reconfirm())
    expect(result.current.error).toMatch(/Couldn’t start/)
  })
})

describe('failures', () => {
  it.each([
    ['TOO_MANY_ATTEMPTS', 429, /Too many attempts/],
    ['SAME_EMAIL', 400, /already your email/],
    ['RATE_LIMITED', 429, /Too many codes/],
    ['ACCOUNT_EXISTS', 409, /already uses this email/],
  ])('explains %s', async (code, status, message) => {
    mocks.start.mockRejectedValue(new ApiError(status, 'x', { code }))
    const { result } = renderHook(() =>
      useChangeEmailFlowState(withPassword, mocks.onClose)
    )
    await act(() => result.current.submitDetails('new@example.com', CURRENT))
    expect(result.current.error).toMatch(message)
  })

  it('keeps the code step for a wrong code, goes back, and reports the unexpected', async () => {
    const { result } = renderHook(() =>
      useChangeEmailFlowState(withPassword, mocks.onClose)
    )
    await act(() => result.current.submitDetails('new@example.com', CURRENT))

    mocks.verify.mockRejectedValue(
      new ApiError(400, 'x', { code: 'INVALID_CODE' })
    )
    await act(() => result.current.submitCode(CODE))
    expect(result.current.step).toBe('code')
    expect(result.current.error).toMatch(/incorrect or has expired/)

    const boom = new Error('boom')
    mocks.verify.mockRejectedValue(boom)
    await act(() => result.current.submitCode(CODE))
    expect(mocks.captureException).toHaveBeenCalledWith(boom)

    act(() => result.current.back())
    expect(result.current.step).toBe('details')
  })

  it('closing drops any stored proof', () => {
    storeGoogleProof('email-change', 'proof-token')
    const { result } = renderHook(() =>
      useChangeEmailFlowState(googleOnly, mocks.onClose)
    )
    act(() => result.current.close())
    expect(peekGoogleProof('email-change')).toBeNull()
    expect(mocks.onClose).toHaveBeenCalled()
  })
})
