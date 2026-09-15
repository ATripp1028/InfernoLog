/**
 * The change-password form. The API, Amplify and routing are mocked.
 *
 * ⚠️ CREDENTIALS — also checks neither password reaches browser storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { FormEvent } from 'react'
import { ApiError } from '@/lib/api/client'
import type { MeData } from '@/lib/api/me'
import { expectNotInBrowserStorage, makeMe } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  change: vi.fn(),
  signInWithPassword: vi.fn(),
  sessionUsesPassword: vi.fn(),
  toastSuccess: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ signInWithPassword: mocks.signInWithPassword }),
}))
vi.mock('@/lib/api/me', () => ({
  useChangePassword: () => ({ mutateAsync: mocks.change, isPending: false }),
}))
vi.mock('@/lib/sessionMethod', () => ({
  sessionUsesPassword: mocks.sessionUsesPassword,
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException },
}))

const { useChangePasswordForm } = await import('../useChangePasswordForm')

const CURRENT = 'Leak-Canary-Pa55!current'
const NEW = 'Leak-Canary-Pa55!new'
const submitEvent = { preventDefault: vi.fn() } as unknown as FormEvent

function me(): MeData {
  return makeMe({
    email: 'player@example.com',
    identities: [
      {
        id: 'pw',
        provider: 'PASSWORD',
        providerAccountId: null,
        email: 'player@example.com',
        canSignIn: true,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  })
}

function filledIn() {
  const hook = renderHook(() => useChangePasswordForm(me()))
  act(() => {
    hook.result.current.setCurrentPassword(CURRENT)
    hook.result.current.setNewPassword(NEW)
    hook.result.current.setConfirmation(NEW)
  })
  return hook
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.change.mockResolvedValue(undefined)
  mocks.sessionUsesPassword.mockResolvedValue(false)
  mocks.signInWithPassword.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
})

describe('useChangePasswordForm', () => {
  it('needs a current password, a valid new one, and a matching confirmation', () => {
    const { result } = renderHook(() => useChangePasswordForm(me()))
    expect(result.current.canSubmit).toBe(false)
    act(() => {
      result.current.setCurrentPassword(CURRENT)
      result.current.setNewPassword(NEW)
      result.current.setConfirmation('different')
    })
    expect(result.current.mismatch).toBe(true)
    expect(result.current.canSubmit).toBe(false)
  })

  it('changes the password, signing other devices out by default, and clears the fields', async () => {
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(mocks.change).toHaveBeenCalledWith({
      currentPassword: CURRENT,
      newPassword: NEW,
      signOutOthers: true,
    })
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(result.current.newPassword).toBe('')
    expect(mocks.toastSuccess).toHaveBeenCalled()
    expectNotInBrowserStorage(CURRENT, NEW)
  })

  it('signs this session back in when it signed in with the password', async () => {
    mocks.sessionUsesPassword.mockResolvedValue(true)
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(mocks.signInWithPassword).toHaveBeenCalledWith(
      'player@example.com',
      NEW
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('sends the user to sign in if re-opening the session fails', async () => {
    mocks.sessionUsesPassword.mockResolvedValue(true)
    mocks.signInWithPassword.mockRejectedValue(new Error('nope'))
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/signin',
      replace: true,
    })
  })

  it('leaves other sessions alone when asked', async () => {
    mocks.sessionUsesPassword.mockResolvedValue(true)
    const { result } = filledIn()
    act(() => result.current.setSignOutOthers(false))

    await act(() => result.current.submit(submitEvent))

    expect(mocks.change).toHaveBeenCalledWith(
      expect.objectContaining({ signOutOthers: false })
    )
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('flags a wrong current password on its field and clears only that field', async () => {
    mocks.change.mockRejectedValue(
      new ApiError(400, 'x', { code: 'CURRENT_PASSWORD_INCORRECT' })
    )
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(result.current.currentPasswordError).toMatch(
      /not your current password/
    )
    expect(result.current.currentPassword).toBe('')
    expect(result.current.newPassword).toBe(NEW)
    expectNotInBrowserStorage(CURRENT, NEW)
  })

  it('explains the lockout, and reports anything unexpected', async () => {
    mocks.change.mockRejectedValue(
      new ApiError(429, 'x', { code: 'TOO_MANY_ATTEMPTS' })
    )
    const { result } = filledIn()
    await act(() => result.current.submit(submitEvent))
    expect(result.current.error).toMatch(/Too many attempts/)

    const boom = new Error('boom')
    mocks.change.mockRejectedValue(boom)
    await act(() => result.current.submit(submitEvent))
    expect(mocks.captureException).toHaveBeenCalledWith(boom)
  })
})
