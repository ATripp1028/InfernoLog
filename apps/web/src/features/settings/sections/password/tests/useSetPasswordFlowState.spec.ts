/**
 * Adding a password to a Google-only account. The API and the Google
 * re-confirmation are mocked.
 *
 * ⚠️ CREDENTIALS — also checks the password and code never reach browser
 * storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ApiError } from '@/lib/api/client'
import { expectNotInBrowserStorage, makeMe } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  complete: vi.fn(),
  startGoogleProof: vi.fn(),
  toastSuccess: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/api/me', () => ({
  useStartPasswordSetup: () => ({ mutateAsync: mocks.start, isPending: false }),
  useCompletePasswordSetup: () => ({
    mutateAsync: mocks.complete,
    isPending: false,
  }),
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
const { useSetPasswordFlowState } = await import('../useSetPasswordFlowState')

const NEW = 'Leak-Canary-Pa55!setup'
const CODE = '314159'
const me = makeMe({ email: 'player@example.com' })

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.start.mockResolvedValue({ codeRequired: false })
  mocks.complete.mockResolvedValue(undefined)
  mocks.startGoogleProof.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
})

function withProof() {
  storeGoogleProof('password-setup', 'proof-token')
  return renderHook(() => useSetPasswordFlowState(me))
}

describe('useSetPasswordFlowState', () => {
  it('starts by asking for a Google re-confirmation', async () => {
    const { result } = renderHook(() => useSetPasswordFlowState(me))
    expect(result.current.step).toBe('reconfirm')

    await act(() => result.current.reconfirm())
    expect(mocks.startGoogleProof).toHaveBeenCalledWith('password-setup')
  })

  it('explains a re-confirmation that could not start', async () => {
    const boom = new Error('crypto unavailable')
    mocks.startGoogleProof.mockRejectedValue(boom)
    const { result } = renderHook(() => useSetPasswordFlowState(me))

    await act(() => result.current.reconfirm())

    expect(result.current.error).toMatch(/Couldn’t start/)
    expect(mocks.captureException).toHaveBeenCalledWith(boom)
  })

  it('goes straight to details with a stored proof, and adds the password on the account email', async () => {
    const { result } = withProof()
    expect(result.current.step).toBe('details')

    await act(() => result.current.submitDetails('player@example.com', NEW))

    expect(mocks.start).toHaveBeenCalledWith({
      email: 'player@example.com',
      googleProof: 'proof-token',
    })
    expect(mocks.complete).toHaveBeenCalledWith({
      email: 'player@example.com',
      newPassword: NEW,
      googleProof: 'proof-token',
    })
    expect(peekGoogleProof('password-setup')).toBeNull()
    expect(mocks.toastSuccess).toHaveBeenCalled()
    expectNotInBrowserStorage(NEW)
  })

  it('asks for a code when the email is new, then adds the password with it', async () => {
    mocks.start.mockResolvedValue({ codeRequired: true })
    const { result } = withProof()

    await act(() => result.current.submitDetails('new@example.com', NEW))
    expect(result.current.step).toBe('code')
    expect(mocks.complete).not.toHaveBeenCalled()

    await act(() => result.current.submitCode(CODE))
    expect(mocks.complete).toHaveBeenCalledWith({
      email: 'new@example.com',
      newPassword: NEW,
      googleProof: 'proof-token',
      verificationCode: CODE,
    })
    expectNotInBrowserStorage(NEW, CODE)
  })

  it('stays on the code step for a wrong code, and resends', async () => {
    mocks.start.mockResolvedValue({ codeRequired: true })
    mocks.complete.mockRejectedValue(
      new ApiError(400, 'x', { code: 'INVALID_CODE' })
    )
    const { result } = withProof()
    await act(() => result.current.submitDetails('new@example.com', NEW))

    await act(() => result.current.submitCode(CODE))
    expect(result.current.step).toBe('code')
    expect(result.current.error).toMatch(/incorrect or has expired/)

    await act(() => result.current.resendCode())
    expect(mocks.start).toHaveBeenCalledTimes(2)

    act(() => result.current.back())
    expect(result.current.step).toBe('details')
  })

  it('returns to re-confirming when the proof has gone stale', async () => {
    mocks.start.mockRejectedValue(
      new ApiError(403, 'x', { code: 'REAUTH_REQUIRED' })
    )
    const { result } = withProof()

    await act(() => result.current.submitDetails('player@example.com', NEW))

    expect(result.current.step).toBe('reconfirm')
    expect(result.current.error).toMatch(/expired/)
    expect(peekGoogleProof('password-setup')).toBeNull()
  })

  it.each([
    ['RATE_LIMITED', 429, /Too many codes/],
    ['ACCOUNT_EXISTS', 409, /already uses this email/],
  ])('explains %s', async (code, status, message) => {
    mocks.start.mockRejectedValue(new ApiError(status, 'x', { code }))
    const { result } = withProof()

    await act(() => result.current.submitDetails('new@example.com', NEW))

    expect(result.current.error).toMatch(message)
  })

  it('reports anything unexpected', async () => {
    const boom = new Error('boom')
    mocks.start.mockRejectedValue(boom)
    const { result } = withProof()

    await act(() => result.current.submitDetails('player@example.com', NEW))

    expect(mocks.captureException).toHaveBeenCalledWith(boom)
  })
})
