/**
 * The forgot-password step machine over Cognito's ForgotPassword flow.
 * Amplify and routing are mocked.
 *
 * ⚠️ CREDENTIALS — also checks the code and new password never reach browser
 * storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { expectNotInBrowserStorage } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  signOut: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ signInWithPassword: mocks.signInWithPassword }),
}))
vi.mock('aws-amplify/auth', () => ({
  resetPassword: mocks.resetPassword,
  confirmResetPassword: mocks.confirmResetPassword,
  signOut: mocks.signOut,
}))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException },
}))

const { useForgotPasswordFlowState } =
  await import('../useForgotPasswordFlowState')

const EMAIL = 'player@example.com'
const NEW_PASSWORD = 'Leak-Canary-Pa55!reset'
const CODE = '551902'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.resetPassword.mockResolvedValue({})
  mocks.confirmResetPassword.mockResolvedValue(undefined)
  mocks.signInWithPassword.mockResolvedValue(undefined)
  mocks.signOut.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
})

async function atResetStep() {
  const hook = renderHook(() => useForgotPasswordFlowState())
  await act(() => hook.result.current.requestCode(EMAIL))
  return hook
}

describe('request step', () => {
  it('asks Cognito for a code and moves on', async () => {
    const { result } = await atResetStep()
    expect(mocks.resetPassword).toHaveBeenCalledWith({ username: EMAIL })
    expect(result.current.step).toBe('reset')
  })

  it('explains throttling and stays put', async () => {
    mocks.resetPassword.mockRejectedValue({ name: 'LimitExceededException' })
    const { result } = renderHook(() => useForgotPasswordFlowState())

    await act(() => result.current.requestCode(EMAIL))

    expect(result.current.step).toBe('request')
    expect(result.current.error).toMatch(/Too many attempts/)
  })
})

describe('reset step', () => {
  it('resets, revokes every session, and sends the visitor to sign in', async () => {
    const { result } = await atResetStep()

    await act(() => result.current.resetWithCode(CODE, NEW_PASSWORD))

    expect(mocks.confirmResetPassword).toHaveBeenCalledWith({
      username: EMAIL,
      confirmationCode: CODE,
      newPassword: NEW_PASSWORD,
    })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith(EMAIL, NEW_PASSWORD)
    expect(mocks.signOut).toHaveBeenCalledWith({ global: true })
    expect(sessionStorage.getItem('il_auth_notice')).toBe('password-reset')
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/signin',
      replace: true,
    })
    expectNotInBrowserStorage(NEW_PASSWORD, CODE)
  })

  it('stays on the step for a wrong code', async () => {
    mocks.confirmResetPassword.mockRejectedValue({
      name: 'CodeMismatchException',
    })
    const { result } = await atResetStep()

    await act(() => result.current.resetWithCode(CODE, NEW_PASSWORD))

    expect(result.current.error).toBe('That code is incorrect or has expired.')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expectNotInBrowserStorage(NEW_PASSWORD, CODE)
  })

  it('still finishes when revoking sessions fails, and reports it', async () => {
    const failure = new Error('global sign-out failed')
    mocks.signInWithPassword.mockRejectedValue(failure)
    const { result } = await atResetStep()

    await act(() => result.current.resetWithCode(CODE, NEW_PASSWORD))

    expect(mocks.captureException).toHaveBeenCalledWith(failure)
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/signin',
      replace: true,
    })
  })

  it('resends to the same address, and explains a failed resend', async () => {
    const { result } = await atResetStep()
    mocks.resetPassword.mockClear()

    await act(() => result.current.resendCode())
    expect(mocks.resetPassword).toHaveBeenCalledWith({ username: EMAIL })
    expect(result.current.resent).toBe(true)

    mocks.resetPassword.mockRejectedValue({ name: 'LimitExceededException' })
    await act(() => result.current.resendCode())
    expect(result.current.error).toMatch(/Too many attempts/)
  })

  it('goes back to change the address', async () => {
    const { result } = await atResetStep()
    act(() => result.current.changeEmail())
    expect(result.current.step).toBe('request')
  })
})
