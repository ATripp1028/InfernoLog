import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AuthIdentity } from '@/lib/api/me'
import { makeMe } from '@/utils/testUtils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  remove: vi.fn(),
  signOut: vi.fn(),
  startGoogleProof: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('aws-amplify/auth', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useConnectDiscord: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDisconnectDiscord: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveSignInMethod: () => ({
    mutateAsync: mocks.remove,
    isPending: false,
  }),
}))
vi.mock('@/lib/googleProof', () => ({
  startGoogleProof: mocks.startGoogleProof,
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException },
}))

const { useAccountSection } = await import('../useAccountSection')

const identity = (overrides: Partial<AuthIdentity>): AuthIdentity => ({
  id: 'id',
  provider: 'GOOGLE',
  providerAccountId: null,
  email: 'player@gmail.com',
  canSignIn: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.signOut.mockResolvedValue(undefined)
})

describe('useAccountSection', () => {
  it('masks emails until shown, and offers to connect Google when it is not a sign-in', () => {
    const me = makeMe({
      identities: [
        identity({ id: 'pw', provider: 'PASSWORD', email: 'sp0rk@proton.me' }),
      ],
    })
    const { result } = renderHook(() => useAccountSection(me))

    expect(result.current.signInMethods[0]?.identifier).toBe('s••••@proton.me')
    expect(result.current.canConnectGoogle).toBe(true)

    act(() => result.current.toggleShowEmails())
    expect(result.current.signInMethods[0]?.identifier).toBe('sp0rk@proton.me')
  })

  it('leaves for Google to connect, and explains a failure to start', async () => {
    const me = makeMe({ identities: [identity({ provider: 'PASSWORD' })] })
    const { result } = renderHook(() => useAccountSection(me))

    await act(() => result.current.handleConnectGoogle())
    expect(mocks.startGoogleProof).toHaveBeenCalledWith('connect-google')

    mocks.startGoogleProof.mockRejectedValue(new Error('boom'))
    await act(() => result.current.handleConnectGoogle())
    expect(mocks.toastError).toHaveBeenCalled()
    expect(result.current.connectingGoogle).toBe(false)
  })

  it('removes a method and stays signed in when it was not this session’s', async () => {
    const me = makeMe({
      identities: [
        identity({ id: 'g' }),
        identity({ id: 'pw', provider: 'PASSWORD' }),
      ],
    })
    mocks.remove.mockResolvedValue({ identityId: 'g', signedOut: false })
    const { result } = renderHook(() => useAccountSection(me))

    act(() => result.current.setRemoveTarget(result.current.signInMethods[0]!))
    await act(() => result.current.handleRemove())

    expect(mocks.remove).toHaveBeenCalledWith('g')
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(result.current.removeTarget).toBeNull()
  })

  it('signs out and goes to sign in after removing this session’s method', async () => {
    const me = makeMe({
      identities: [
        identity({ id: 'g' }),
        identity({ id: 'pw', provider: 'PASSWORD' }),
      ],
    })
    mocks.remove.mockResolvedValue({ identityId: 'pw', signedOut: true })
    const { result } = renderHook(() => useAccountSection(me))

    act(() => result.current.setRemoveTarget(result.current.signInMethods[1]!))
    await act(() => result.current.handleRemove())

    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/signin',
      replace: true,
    })
  })

  it('shows a failed removal', async () => {
    const me = makeMe({
      identities: [
        identity({ id: 'g' }),
        identity({ id: 'pw', provider: 'PASSWORD' }),
      ],
    })
    mocks.remove.mockRejectedValue(
      new Error('This is your only way to sign in.')
    )
    const { result } = renderHook(() => useAccountSection(me))

    act(() => result.current.setRemoveTarget(result.current.signInMethods[0]!))
    await act(() => result.current.handleRemove())

    expect(mocks.toastError).toHaveBeenCalledWith(
      'This is your only way to sign in.'
    )
  })
})
