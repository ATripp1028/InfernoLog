/**
 * The signup page wired together: the real flow provider, steps and step
 * hooks, with the API, Amplify and routing mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ApiError } from '@/lib/api/client'
import { expectNotInBrowserStorage } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  getIdToken: vi.fn(),
  passwordSignupStart: vi.fn(),
  passwordSignupVerify: vi.fn(),
  destinationAfterSignIn: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    signUp: mocks.signUp,
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
vi.mock('aws-amplify/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn() } }))

const { SignUpPage } = await import('../SignUpPage')

const PASSWORD = 'Leak-Canary-Pa55!page'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.passwordSignupStart.mockResolvedValue(undefined)
  mocks.passwordSignupVerify.mockResolvedValue(undefined)
  mocks.signInWithPassword.mockResolvedValue(undefined)
  mocks.getIdToken.mockResolvedValue('id-token')
  mocks.destinationAfterSignIn.mockResolvedValue('/onboarding')
  localStorage.clear()
  sessionStorage.clear()
})

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

function fillCredentials(confirmation = PASSWORD) {
  type('Email', 'Player@Example.com')
  type('Password', PASSWORD)
  type('Confirm password', confirmation)
}

describe('SignUpPage', () => {
  it('keeps Continue disabled until the password meets every rule and matches', () => {
    render(<SignUpPage />)
    const cont = screen.getByRole('button', { name: 'Continue' })
    expect(cont).toBeDisabled()

    type('Email', 'player@example.com')
    type('Password', 'short')
    expect(screen.getByText('Uppercase letter').textContent).toContain(
      '(not met)'
    )
    expect(cont).toBeDisabled()

    fillCredentials('something-else')
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument()
    expect(cont).toBeDisabled()

    fillCredentials()
    expect(cont).toBeEnabled()
  })

  it('goes from credentials to the code step to onboarding', async () => {
    render(<SignUpPage />)
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await screen.findByRole('heading', { name: 'Enter your code' })
    expect(mocks.passwordSignupStart).toHaveBeenCalledWith({
      email: 'player@example.com',
    })
    expect(screen.getByText('player@example.com')).toBeInTheDocument()

    type('Verification code', '48 29-13')
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }))

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/onboarding',
        replace: true,
      })
    )
    expect(mocks.passwordSignupVerify).toHaveBeenCalledWith({
      email: 'player@example.com',
      verificationCode: '482913',
      password: PASSWORD,
    })
    expectNotInBrowserStorage(PASSWORD, '482913')
  })

  it('shows a wrong code on the code step', async () => {
    mocks.passwordSignupVerify.mockRejectedValue(
      new ApiError(400, 'x', { code: 'INVALID_CODE' })
    )
    render(<SignUpPage />)
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: 'Enter your code' })

    type('Verification code', '000000')
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }))

    expect(
      await screen.findByText('That code is incorrect or has expired.')
    ).toBeInTheDocument()
  })

  it('shows the notice left by a refused Google signup, once', () => {
    sessionStorage.setItem('il_auth_notice', 'account-exists')
    render(<SignUpPage />)
    expect(
      screen.getByText(/already uses that Google account's email/)
    ).toBeInTheDocument()
    expect(sessionStorage.getItem('il_auth_notice')).toBeNull()
  })

  it('offers Google sign-up and no Discord', () => {
    render(<SignUpPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }))
    expect(mocks.signUp).toHaveBeenCalled()
    expect(screen.queryByText(/Discord/)).toBeNull()
  })
})
