/**
 * The sign-in page's markup and wiring, with its logic hook's collaborators
 * mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signIn: vi.fn(),
  signInWithPassword: vi.fn(),
  getIdToken: vi.fn(),
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
    signIn: mocks.signIn,
    signInWithPassword: mocks.signInWithPassword,
    getIdToken: mocks.getIdToken,
  }),
}))
vi.mock('../../destinationAfterSignIn', () => ({
  destinationAfterSignIn: mocks.destinationAfterSignIn,
}))
vi.mock('aws-amplify/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn() } }))

const { SignInPage } = await import('../SignInPage')

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.getIdToken.mockResolvedValue('id-token')
  mocks.destinationAfterSignIn.mockResolvedValue('/log')
  sessionStorage.clear()
})

describe('SignInPage', () => {
  it('links to password reset and to the age gate, and offers only Google', () => {
    render(<SignInPage />)
    expect(
      screen.getByRole('link', { name: 'Forgot password?' })
    ).toHaveAttribute('href', '/forgot-password')
    expect(
      screen.getByRole('link', { name: 'Create an account' })
    ).toHaveAttribute('href', '/age-gate')
    expect(
      screen.getByRole('button', { name: 'Continue with Google' })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Discord/)).toBeNull()
  })

  it('shows the error from a failed sign-in', async () => {
    mocks.signInWithPassword.mockRejectedValue({
      name: 'NotAuthorizedException',
      message: 'Incorrect username or password.',
    })
    render(<SignInPage />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Leak-Canary-Pa55!x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email or password.'
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    )
  })
})
