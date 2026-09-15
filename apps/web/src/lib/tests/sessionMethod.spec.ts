import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchAuthSession } = vi.hoisted(() => ({ fetchAuthSession: vi.fn() }))
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession }))

const { sessionUsesPassword } = await import('../sessionMethod')

beforeEach(() => fetchAuthSession.mockReset())

describe('sessionUsesPassword', () => {
  it('is true for a native user, whose token has no identities claim', async () => {
    fetchAuthSession.mockResolvedValue({
      tokens: { idToken: { payload: { sub: 's' } } },
    })
    await expect(sessionUsesPassword()).resolves.toBe(true)
  })

  it('is false for a Google session, and without a session', async () => {
    fetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: { payload: { identities: [{ providerName: 'Google' }] } },
      },
    })
    await expect(sessionUsesPassword()).resolves.toBe(false)

    fetchAuthSession.mockResolvedValue({ tokens: undefined })
    await expect(sessionUsesPassword()).resolves.toBe(false)
  })
})
