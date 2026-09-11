import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { toast } from '@/components/generic/sonner'
import { useUpdateMe } from '@/lib/api/me'
import { makeMe, stubMutation } from '@/utils/testUtils'
import { useYouTubeEmbedConsentField } from '../useYouTubeEmbedConsentField'

vi.mock('@/lib/api/me', () => ({ useUpdateMe: vi.fn() }))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mutateAsync = vi.fn()

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(undefined)
  vi.mocked(useUpdateMe).mockReturnValue(stubMutation({ mutateAsync }))
  vi.mocked(toast.error).mockClear()
})

describe('useYouTubeEmbedConsentField', () => {
  it.each([true, false])('reads the switch from the account (%s)', (given) => {
    const { result } = renderHook(() =>
      useYouTubeEmbedConsentField(makeMe({ youtubeEmbedConsent: given }))
    )

    expect(result.current.allowed).toBe(given)
  })

  // Giving and withdrawing are the same one-click write.
  it.each([true, false])('saves %s as the account’s consent', (next) => {
    const { result } = renderHook(() => useYouTubeEmbedConsentField(makeMe()))

    result.current.onAllowedChange(next)

    expect(mutateAsync).toHaveBeenCalledWith({ youtubeEmbedConsent: next })
  })

  it('says so when the save fails', async () => {
    mutateAsync.mockRejectedValue(new Error('Network down'))
    const { result } = renderHook(() => useYouTubeEmbedConsentField(makeMe()))

    result.current.onAllowedChange(true)

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Network down')
    )
  })
})
