/**
 * The forgot-password page wired together: the real flow provider, steps and
 * step hooks, with Amplify and routing mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expectNotInBrowserStorage } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ signInWithPassword: mocks.signInWithPassword }),
}))
vi.mock('aws-amplify/auth', () => ({
  resetPassword: mocks.resetPassword,
  confirmResetPassword: mocks.confirmResetPassword,
  signOut: mocks.signOut,
}))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn() } }))

const { ForgotPasswordPage } = await import('../ForgotPasswordPage')

const NEW_PASSWORD = 'Leak-Canary-Pa55!resetpage'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.resetPassword.mockResolvedValue({})
  mocks.confirmResetPassword.mockResolvedValue(undefined)
  mocks.signInWithPassword.mockResolvedValue(undefined)
  mocks.signOut.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
})

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('ForgotPasswordPage', () => {
  it('rejects an invalid email before asking Cognito', async () => {
    render(<ForgotPasswordPage />)
    type('Email', 'nope')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(
      await screen.findByText('Enter a valid email address')
    ).toBeInTheDocument()
    expect(mocks.resetPassword).not.toHaveBeenCalled()
  })

  it('requests a code, then resets with it', async () => {
    render(<ForgotPasswordPage />)
    type('Email', ' Player@Example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await screen.findByRole('heading', { name: 'Choose a new password' })
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      username: 'player@example.com',
    })

    const reset = screen.getByRole('button', { name: 'Reset password' })
    type('Code', '551902')
    type('New password', NEW_PASSWORD)
    type('Confirm new password', 'different')
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument()
    expect(reset).toBeDisabled()

    type('Confirm new password', NEW_PASSWORD)
    expect(reset).toBeEnabled()
    fireEvent.click(reset)

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/signin',
        replace: true,
      })
    )
    expect(mocks.confirmResetPassword).toHaveBeenCalledWith({
      username: 'player@example.com',
      confirmationCode: '551902',
      newPassword: NEW_PASSWORD,
    })
    expectNotInBrowserStorage(NEW_PASSWORD, '551902')
  })

  it('resends a code from the reset step', async () => {
    render(<ForgotPasswordPage />)
    type('Email', 'player@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByRole('heading', { name: 'Choose a new password' })

    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))

    expect(await screen.findByText('We sent a new code.')).toBeInTheDocument()
    expect(mocks.resetPassword).toHaveBeenCalledTimes(2)
  })
})
