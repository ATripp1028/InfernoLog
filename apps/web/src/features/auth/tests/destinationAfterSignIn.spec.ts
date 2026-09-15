import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'

const { apiFetch, signupStart } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  signupStart: vi.fn(),
}))

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiFetch,
}))
vi.mock('@/lib/api/authOnboarding', () => ({ signupStart }))

const { destinationAfterSignIn } = await import('../destinationAfterSignIn')

beforeEach(() => {
  apiFetch.mockReset()
  signupStart.mockReset()
})

describe('destinationAfterSignIn', () => {
  it('sends an onboarded account to its log', async () => {
    apiFetch.mockResolvedValue({ data: { onboardingCompleted: true } })
    await expect(destinationAfterSignIn('token')).resolves.toBe('/log')
    expect(signupStart).not.toHaveBeenCalled()
  })

  it('sends an account mid-onboarding back to the wizard', async () => {
    apiFetch.mockResolvedValue({ data: { onboardingCompleted: false } })
    await expect(destinationAfterSignIn('token')).resolves.toBe('/onboarding')
  })

  it('finishes a signup that never created its account', async () => {
    apiFetch.mockRejectedValue(new ApiError(404, 'User not found'))
    signupStart.mockResolvedValue({ id: 'u1', onboardingCompleted: false })

    await expect(destinationAfterSignIn('token')).resolves.toBe('/onboarding')
    expect(signupStart).toHaveBeenCalledWith('token')
  })

  it('passes on any other failure, including a refused signup', async () => {
    apiFetch.mockRejectedValue(new ApiError(500, 'boom'))
    await expect(destinationAfterSignIn('token')).rejects.toThrow('boom')

    apiFetch.mockRejectedValue(new ApiError(404, 'User not found'))
    signupStart.mockRejectedValue(
      new ApiError(409, 'exists', { code: 'ACCOUNT_EXISTS' })
    )
    await expect(destinationAfterSignIn('token')).rejects.toMatchObject({
      status: 409,
    })
  })
})
