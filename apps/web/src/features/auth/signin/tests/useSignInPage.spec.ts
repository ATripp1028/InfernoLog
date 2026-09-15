/**
 * The sign-in page's form logic. Amplify, the API and routing are mocked.
 *
 * ⚠️ CREDENTIALS — also checks the typed password never reaches browser storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { FormEvent } from 'react'
import { ApiError } from '@/lib/api/client'
import { expectNotInBrowserStorage } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signIn: vi.fn(),
  signInWithPassword: vi.fn(),
  getIdToken: vi.fn(),
  destinationAfterSignIn: vi.fn(),
  signOut: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    signIn: mocks.signIn,
    signInWithPassword: mocks.signInWithPassword,
    getIdToken: mocks.getIdToken,
  }),
}))
vi.mock('../../destinationAfterSignIn', () => ({
  destinationAfterSignIn: mocks.destinationAfterSignIn,
}))
vi.mock('aws-amplify/auth', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException },
}))

const { useSignInPage } = await import('../useSignInPage')

const PASSWORD = 'Leak-Canary-Pa55!signin'
const submitEvent = { preventDefault: vi.fn() } as unknown as FormEvent

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.signInWithPassword.mockResolvedValue(undefined)
  mocks.getIdToken.mockResolvedValue('id-token')
  mocks.destinationAfterSignIn.mockResolvedValue('/log')
  mocks.signOut.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
})

function filledIn(email = ' Player@Example.com ') {
  const hook = renderHook(() => useSignInPage())
  act(() => {
    hook.result.current.setEmail(email)
    hook.result.current.setPassword(PASSWORD)
  })
  return hook
}

describe('useSignInPage', () => {
  it('signs in with the normalized email and routes to the destination', async () => {
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(mocks.signInWithPassword).toHaveBeenCalledWith(
      'player@example.com',
      PASSWORD
    )
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/log', replace: true })
    expect(result.current.password).toBe('')
    expectNotInBrowserStorage(PASSWORD)
  })

  it('shows the generic message for a wrong password', async () => {
    mocks.signInWithPassword.mockRejectedValue({
      name: 'NotAuthorizedException',
      message: 'Incorrect username or password.',
    })
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(result.current.error).toBe('Incorrect email or password.')
    expect(result.current.submitting).toBe(false)
    expect(mocks.navigate).not.toHaveBeenCalled()
    expectNotInBrowserStorage(PASSWORD)
  })

  it('shows the lockout message', async () => {
    mocks.signInWithPassword.mockRejectedValue({
      name: 'NotAuthorizedException',
      message: 'Password attempts exceeded',
    })
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(result.current.error).toMatch(/Too many attempts/)
  })

  it('refuses an invalid email without calling Cognito', async () => {
    const { result } = filledIn('not-an-email')

    await act(() => result.current.submit(submitEvent))

    expect(result.current.error).toBe('Incorrect email or password.')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs back out when an unfinished signup turns out to be refused', async () => {
    mocks.destinationAfterSignIn.mockRejectedValue(
      new ApiError(409, 'x', { code: 'ACCOUNT_EXISTS' })
    )
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(mocks.signOut).toHaveBeenCalled()
    expect(result.current.error).toMatch(/already uses this email/)
  })

  it('reports an unexpected failure', async () => {
    const failure = new Error('boom')
    mocks.signInWithPassword.mockRejectedValue(failure)
    const { result } = filledIn()

    await act(() => result.current.submit(submitEvent))

    expect(mocks.captureException).toHaveBeenCalledWith(failure)
  })

  it('shows the password-reset notice once, then clears it', () => {
    sessionStorage.setItem('il_auth_notice', 'password-reset')

    const { result } = renderHook(() => useSignInPage())

    expect(result.current.notice).toBe('password-reset')
    expect(sessionStorage.getItem('il_auth_notice')).toBeNull()
  })

  it('hands the Google button the OAuth sign-in', () => {
    const { result } = renderHook(() => useSignInPage())
    result.current.signInWithGoogle()
    expect(mocks.signIn).toHaveBeenCalled()
  })
})
