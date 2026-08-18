/**
 * Unit tests for the Discord link completion hook.
 *
 * This hook exists for a security reason rather than a UI one: it is what makes
 * the OAuth code get spent by a request carrying the user's JWT, instead of by
 * the public redirect target that cannot authenticate anyone. So the tests care
 * about what it sends and where it goes afterwards — and, importantly, that it
 * sends exactly once, because a Discord authorization code is single-use.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { ApiError } from '@/lib/api/client'

const { navigate, mutate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/lib/api/me', () => ({
  useCompleteDiscordLink: () => ({ mutate }),
}))

const { useDiscordLinkComplete } = await import('../useDiscordLinkComplete')

const CODE = 'discord-code'
const STATE = 'signed-state'

/**
 * Runs the hook and returns the mutation's callbacks, if it fired.
 *
 * Both params are required rather than defaulted: the missing-param cases pass
 * `undefined` deliberately, and a default would silently substitute a real
 * value for exactly the input under test.
 */
function render(code: string | undefined, state: string | undefined) {
  renderHook(() => useDiscordLinkComplete(code, state))
  const call = mutate.mock.calls[0]
  return {
    input: call?.[0] as { code: string; state: string } | undefined,
    onSuccess: call?.[1]?.onSuccess as (() => void) | undefined,
    onError: call?.[1]?.onError as ((e: unknown) => void) | undefined,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sending the exchange', () => {
  it('posts the code and state it was handed', () => {
    const { input } = render(CODE, STATE)

    expect(input).toEqual({ code: CODE, state: STATE })
  })

  it('fires exactly once even if the effect re-runs', () => {
    // React 18 StrictMode double-invokes effects in development. A Discord
    // code is single-use, so a second exchange would be rejected and would
    // report a failure over a link that had actually succeeded.
    const { rerender } = renderHook(() => useDiscordLinkComplete(CODE, STATE))
    rerender()
    rerender()

    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no code', undefined, STATE],
    ['no state', CODE, undefined],
  ])('does not call the API with %s', (_label, code, state) => {
    render(code, state)

    expect(mutate).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: { discord: 'error', reason: 'missing_code' },
      })
    )
  })
})

describe('leaving for the settings page', () => {
  it('reports success', async () => {
    const { onSuccess } = render(CODE, STATE)
    onSuccess!()

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/settings',
          search: { discord: 'connected' },
        })
      )
    )
  })

  it('replaces history so the code cannot be revisited', async () => {
    // The URL carries the authorization code. Pushing would leave it in the
    // back stack; replacing drops it as soon as we move on.
    const { onSuccess } = render(CODE, STATE)
    onSuccess!()

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ replace: true })
      )
    )
  })

  it.each([
    ['state_mismatch', 403],
    ['already_linked_elsewhere', 409],
    ['invalid_state', 400],
    ['exchange_failed', 502],
  ])('forwards the API reason %s', async (reason, status) => {
    const { onError } = render(CODE, STATE)
    onError!(new ApiError(status, 'nope', { reason }))

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ search: { discord: 'error', reason } })
      )
    )
  })

  it.each([
    ['a plain Error', new Error('offline')],
    ['an ApiError with no reason', new ApiError(500, 'boom', {})],
    [
      'an ApiError with a non-string reason',
      new ApiError(500, 'boom', { reason: 7 }),
    ],
  ])('falls back to internal_error for %s', async (_label, error) => {
    const { onError } = render(CODE, STATE)
    onError!(error)

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { discord: 'error', reason: 'internal_error' },
        })
      )
    )
  })
})
