import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { ApiError } from '@/lib/api/client'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  connectGoogle: vi.fn(),
  completeGoogleProof: vi.fn(),
  storeGoogleProof: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/lib/api/me', () => ({
  useConnectGoogle: () => ({ mutateAsync: mocks.connectGoogle }),
}))
vi.mock('@/lib/googleProof', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/googleProof')>()),
  completeGoogleProof: mocks.completeGoogleProof,
  storeGoogleProof: mocks.storeGoogleProof,
}))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException },
}))

const { GoogleProofFlowError } = await import('@/lib/googleProof')
const { useGoogleProofComplete } = await import('../useGoogleProofComplete')

const search = { code: 'c', state: 's' }

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()))

const leftWith = (outcome: Record<string, string>) =>
  waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/settings',
      replace: true,
      search: outcome,
    })
  )

describe('useGoogleProofComplete', () => {
  it('connects Google with the proof, once', async () => {
    mocks.completeGoogleProof.mockResolvedValue({
      purpose: 'connect-google',
      idToken: 'id-token',
    })
    mocks.connectGoogle.mockResolvedValue({})

    const { rerender } = renderHook(() => useGoogleProofComplete(search))
    rerender()

    await leftWith({ google: 'connected' })
    expect(mocks.connectGoogle).toHaveBeenCalledTimes(1)
    expect(mocks.connectGoogle).toHaveBeenCalledWith({
      googleProof: 'id-token',
    })
    expect(mocks.completeGoogleProof).toHaveBeenCalledTimes(1)
  })

  it('keeps a password-setup proof for the form instead of using it', async () => {
    mocks.completeGoogleProof.mockResolvedValue({
      purpose: 'password-setup',
      idToken: 'id-token',
    })

    renderHook(() => useGoogleProofComplete(search))

    await leftWith({ google: 'reconfirmed' })
    expect(mocks.storeGoogleProof).toHaveBeenCalledWith(
      'password-setup',
      'id-token'
    )
    expect(mocks.connectGoogle).not.toHaveBeenCalled()
  })

  it('reports why connecting was refused', async () => {
    mocks.completeGoogleProof.mockResolvedValue({
      purpose: 'connect-google',
      idToken: 'id-token',
    })
    mocks.connectGoogle.mockRejectedValue(
      new ApiError(409, 'x', { code: 'CONNECTED_ELSEWHERE' })
    )

    renderHook(() => useGoogleProofComplete(search))

    await leftWith({ google: 'error', reason: 'CONNECTED_ELSEWHERE' })
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('reports a flow failure, and captures anything unexpected', async () => {
    mocks.completeGoogleProof.mockRejectedValue(
      new GoogleProofFlowError('cancelled')
    )
    renderHook(() => useGoogleProofComplete({ error: 'access_denied' }))
    await leftWith({ google: 'error', reason: 'cancelled' })

    mocks.navigate.mockReset()
    const boom = new Error('boom')
    mocks.completeGoogleProof.mockRejectedValue(boom)
    renderHook(() => useGoogleProofComplete(search))
    await leftWith({ google: 'error', reason: 'exchange-failed' })
    expect(mocks.captureException).toHaveBeenCalledWith(boom)
  })

  it('captures an unexpected connect failure', async () => {
    mocks.completeGoogleProof.mockResolvedValue({
      purpose: 'connect-google',
      idToken: 'id-token',
    })
    const boom = new Error('boom')
    mocks.connectGoogle.mockRejectedValue(boom)

    renderHook(() => useGoogleProofComplete(search))

    await leftWith({ google: 'error', reason: 'internal_error' })
    expect(mocks.captureException).toHaveBeenCalledWith(boom)
  })
})
