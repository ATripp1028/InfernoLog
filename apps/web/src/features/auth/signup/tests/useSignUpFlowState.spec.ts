/**
 * The email-and-password signup step machine. The API, Amplify and routing are
 * mocked at the module boundary.
 *
 * ⚠️ CREDENTIALS — the flow holds a password between its two steps, so these
 * specs also check it never reaches browser storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ApiError } from '@/lib/api/client'
import { expectNotInBrowserStorage } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInWithPassword: vi.fn(),
  getIdToken: vi.fn(),
  passwordSignupStart: vi.fn(),
  passwordSignupVerify: vi.fn(),
  destinationAfterSignIn: vi.fn(),
  signOut: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    signInWithPassword: mocks.signInWithPassword,
    getIdToken: mocks.getIdToken,
  }),
}))
vi.mock('@/lib/api/authOnboarding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/authOnboarding')>()),
  passwordSignupStart: mocks.passwordSignupStart,
  passwordSignupVerify: mocks.passwordSignupVerify,
}))
vi.mock('../../destinationAfterSignIn', () => ({
  destinationAfterSignIn: mocks.destinationAfterSignIn,
}))
vi.mock('aws-amplify/auth', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException },
}))

const { useSignUpFlowState } = await import('../useSignUpFlowState')

// `Leak-Canary-` is allowlisted in .gitleaks.toml.
const EMAIL = 'player@example.com'
const PASSWORD = 'Leak-Canary-Pa55!signup'
const CODE = '482913'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.passwordSignupStart.mockResolvedValue(undefined)
  mocks.passwordSignupVerify.mockResolvedValue(undefined)
  mocks.signInWithPassword.mockResolvedValue(undefined)
  mocks.getIdToken.mockResolvedValue('id-token')
  mocks.destinationAfterSignIn.mockResolvedValue('/onboarding')
  mocks.signOut.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
})

async function atVerifyStep() {
  const hook = renderHook(() => useSignUpFlowState())
  await act(() => hook.result.current.submitCredentials(EMAIL, PASSWORD))
  return hook
}

describe('credentials step', () => {
  it('requests a code and moves to the code step', async () => {
    const { result } = await atVerifyStep()

    expect(mocks.passwordSignupStart).toHaveBeenCalledWith({ email: EMAIL })
    expect(result.current.step).toBe('verify')
    expect(result.current.email).toBe(EMAIL)
  })

  it('stays put and explains a rate limit', async () => {
    mocks.passwordSignupStart.mockRejectedValue(
      new ApiError(429, 'x', { code: 'RATE_LIMITED' })
    )
    const { result } = renderHook(() => useSignUpFlowState())

    await act(() => result.current.submitCredentials(EMAIL, PASSWORD))

    expect(result.current.step).toBe('credentials')
    expect(result.current.error?.kind).toBe('rate-limited')
    expect(result.current.pending).toBe(false)
  })
})

describe('code step', () => {
  it('verifies, signs in, creates the account and routes onward', async () => {
    const { result } = await atVerifyStep()

    await act(() => result.current.submitCode(CODE))

    expect(mocks.passwordSignupVerify).toHaveBeenCalledWith({
      email: EMAIL,
      verificationCode: CODE,
      password: PASSWORD,
    })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith(EMAIL, PASSWORD)
    expect(mocks.destinationAfterSignIn).toHaveBeenCalledWith('id-token')
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/onboarding',
      replace: true,
    })
    expectNotInBrowserStorage(PASSWORD, CODE)
  })

  it('stays on the code step for a wrong code, without signing in', async () => {
    mocks.passwordSignupVerify.mockRejectedValue(
      new ApiError(400, 'x', { code: 'INVALID_CODE' })
    )
    const { result } = await atVerifyStep()

    await act(() => result.current.submitCode(CODE))

    expect(result.current.step).toBe('verify')
    expect(result.current.error?.kind).toBe('invalid-code')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expectNotInBrowserStorage(PASSWORD, CODE)
  })

  it('signs out and explains when the address became an account meanwhile', async () => {
    mocks.destinationAfterSignIn.mockRejectedValue(
      new ApiError(409, 'x', { code: 'ACCOUNT_EXISTS' })
    )
    const { result } = await atVerifyStep()

    await act(() => result.current.submitCode(CODE))

    expect(result.current.error?.kind).toBe('account-exists')
    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('reports an unexpected failure', async () => {
    const failure = new Error('boom')
    mocks.signInWithPassword.mockRejectedValue(failure)
    const { result } = await atVerifyStep()

    await act(() => result.current.submitCode(CODE))

    expect(result.current.error?.kind).toBe('unknown')
    expect(mocks.captureException).toHaveBeenCalledWith(failure)
  })

  it('resends a code to the same address', async () => {
    const { result } = await atVerifyStep()
    mocks.passwordSignupStart.mockClear()

    await act(() => result.current.resendCode())

    expect(mocks.passwordSignupStart).toHaveBeenCalledWith({ email: EMAIL })
    expect(result.current.resent).toBe(true)
  })

  it('explains a failed resend', async () => {
    const { result } = await atVerifyStep()
    mocks.passwordSignupStart.mockRejectedValue(
      new ApiError(429, 'x', { code: 'RATE_LIMITED' })
    )

    await act(() => result.current.resendCode())

    expect(result.current.error?.kind).toBe('rate-limited')
    expect(result.current.resent).toBe(false)
  })

  it('goes back to change the address, dropping the password', async () => {
    const { result } = await atVerifyStep()

    act(() => result.current.changeEmail())
    expect(result.current.step).toBe('credentials')

    // Submitting a code from here would send an empty password: the flow
    // forgot it rather than reusing it for a different address.
    await act(() => result.current.submitCode(CODE))
    expect(mocks.passwordSignupVerify).toHaveBeenCalledWith(
      expect.objectContaining({ password: '' })
    )
  })
})
