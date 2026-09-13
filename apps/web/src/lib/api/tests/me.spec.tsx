import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeMe, queryWrapper } from '@/utils/testUtils'
import type { AuthIdentity, MeData } from '../me'

// Linking and unlinking Discord write the result straight into the cached user
// so the settings page is right before any refetch. An account holds at most
// one Discord identity, so both writes must leave exactly the right one — and
// must not disturb the sign-in identities beside it.

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('../client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client')>()),
  apiFetch,
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    getIdToken: async () => 'token',
  }),
}))

const { meQueryKey, useCompleteDiscordLink, useDisconnectDiscord } =
  await import('../me')

function identity(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
  return {
    id: 'google-1',
    provider: 'GOOGLE',
    providerAccountId: null,
    email: 'player@gmail.com',
    canSignIn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

const google = identity()
const oldDiscord = identity({
  id: 'discord-old',
  provider: 'DISCORD',
  providerAccountId: '111',
  email: null,
  canSignIn: false,
})
const newDiscord = {
  ...oldDiscord,
  id: 'discord-new',
  providerAccountId: '222',
}

function renderWithCachedMe<T>(hook: () => T, identities: AuthIdentity[]) {
  const { queryClient, wrapper } = queryWrapper()
  queryClient.setQueryData<MeData>(meQueryKey, makeMe({ identities }))
  const { result } = renderHook(hook, { wrapper })
  const cachedIdentities = () =>
    queryClient.getQueryData<MeData>(meQueryKey)!.identities
  return { result, cachedIdentities }
}

beforeEach(() => {
  apiFetch.mockReset()
})

describe('useCompleteDiscordLink', () => {
  it('adds the new Discord identity beside the existing ones', async () => {
    apiFetch.mockResolvedValue({ data: { identity: newDiscord } })
    const { result, cachedIdentities } = renderWithCachedMe(
      useCompleteDiscordLink,
      [google]
    )

    await act(() => result.current.mutateAsync({ code: 'c', state: 's' }))

    expect(cachedIdentities()).toEqual([google, newDiscord])
  })

  it('replaces a previously linked Discord identity', async () => {
    apiFetch.mockResolvedValue({ data: { identity: newDiscord } })
    const { result, cachedIdentities } = renderWithCachedMe(
      useCompleteDiscordLink,
      [google, oldDiscord]
    )

    await act(() => result.current.mutateAsync({ code: 'c', state: 's' }))

    expect(cachedIdentities()).toEqual([google, newDiscord])
  })
})

describe('useDisconnectDiscord', () => {
  it('removes only the Discord identity', async () => {
    apiFetch.mockResolvedValue({ data: { disconnected: true } })
    const { result, cachedIdentities } = renderWithCachedMe(
      useDisconnectDiscord,
      [google, oldDiscord]
    )

    await act(() => result.current.mutateAsync())

    expect(cachedIdentities()).toEqual([google])
  })
})
