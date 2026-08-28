import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_FPS, MAX_FPS } from '@infernolog/core'
import { makeMe, stubMutation } from '@/utils/testUtils'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useUpdateMe: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { useUpdateMe } = await import('@/lib/api/me')
const { useLoggingPreferencesFields } =
  await import('../useLoggingPreferencesFields')

let updateAsync: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  updateAsync = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useUpdateMe).mockReturnValue(
    stubMutation({ mutateAsync: updateAsync })
  )
})

const render = (overrides = {}) =>
  renderHook(() => useLoggingPreferencesFields(makeMe(overrides)))

describe('the save-on-change rows', () => {
  it('reads its values straight through from the user', () => {
    const { result } = render({
      dateFormatPreference: 'DMY',
      defaultPercentageVersion: 'TWO_ONE',
      defaultDevice: 'mobile',
      showHighlightUrl: true,
    })

    expect(result.current.dateFormat).toBe('DMY')
    expect(result.current.percentageVersion).toBe('TWO_ONE')
    expect(result.current.device).toBe('mobile')
    expect(result.current.showHighlightUrl).toBe(true)
  })

  it.each([
    ['onDateFormatChange', 'MDY', { dateFormatPreference: 'MDY' }],
    [
      'onPercentageVersionChange',
      'TWO_ONE',
      { defaultPercentageVersion: 'TWO_ONE' },
    ],
    ['onDeviceChange', 'mobile', { defaultDevice: 'mobile' }],
  ] as const)(
    'patches only its own field from %s',
    async (handler, value, patch) => {
      const { result } = render()

      await act(async () => result.current[handler](value))

      expect(updateAsync).toHaveBeenCalledExactlyOnceWith(patch)
    }
  )

  it('patches the highlight toggle', async () => {
    const { result } = render()

    await act(async () => result.current.onShowHighlightUrlChange(true))

    expect(updateAsync).toHaveBeenCalledExactlyOnceWith({
      showHighlightUrl: true,
    })
  })

  // No Save button, so a failed write has nowhere to surface but a toast —
  // and must not take the other rows down with it.
  it('toasts a failed write', async () => {
    updateAsync.mockRejectedValue(new Error('nope'))
    const { result } = render()

    await act(async () => result.current.onDeviceChange('mobile'))

    expect(toast.error).toHaveBeenCalledWith('nope')
  })
})

describe('the FPS draft', () => {
  it('starts from the saved value and follows it when it changes', () => {
    const { result, rerender } = renderHook(
      ({ fps }) => useLoggingPreferencesFields(makeMe({ defaultFps: fps })),
      { initialProps: { fps: 60 } }
    )
    expect(result.current.fpsDraft).toBe('60')

    rerender({ fps: 240 })

    expect(result.current.fpsDraft).toBe('240')
  })

  // The whole point of drafting: a half-typed or cleared field must not be
  // parsed and saved on every keystroke.
  it('does not write while the user is typing', () => {
    const { result } = render()

    act(() => result.current.onFpsDraftChange(''))

    expect(result.current.fpsDraft).toBe('')
    expect(updateAsync).not.toHaveBeenCalled()
  })

  it('commits a valid draft on blur', async () => {
    const { result } = render({ defaultFps: 60 })

    act(() => result.current.onFpsDraftChange('240'))
    await act(async () => result.current.onFpsBlur())

    expect(updateAsync).toHaveBeenCalledExactlyOnceWith({ defaultFps: 240 })
  })

  it('floors a fractional draft rather than rejecting it', async () => {
    const { result } = render({ defaultFps: 60 })

    act(() => result.current.onFpsDraftChange('120.9'))
    await act(async () => result.current.onFpsBlur())

    expect(updateAsync).toHaveBeenCalledExactlyOnceWith({ defaultFps: 120 })
    expect(result.current.fpsDraft).toBe('120')
  })

  it('skips the write when the draft matches what is already saved', async () => {
    const { result } = render({ defaultFps: 60 })

    await act(async () => result.current.onFpsBlur())

    expect(updateAsync).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['not a number', 'abc'],
    ['below the floor', String(MIN_FPS - 1)],
    ['above the ceiling', String(MAX_FPS + 1)],
  ])(
    'reverts an out-of-range draft (%s) and says why',
    async (_label, draft) => {
      const { result } = render({ defaultFps: 60 })

      act(() => result.current.onFpsDraftChange(draft))
      await act(async () => result.current.onFpsBlur())

      expect(updateAsync).not.toHaveBeenCalled()
      expect(result.current.fpsDraft).toBe('60')
      expect(toast.error).toHaveBeenCalledWith(
        `FPS must be a whole number between ${MIN_FPS} and ${MAX_FPS}`
      )
    }
  )

  // The one control with a draft to roll back — leaving the rejected number
  // in the box would read as saved.
  it('reverts the draft when the write fails', async () => {
    updateAsync.mockRejectedValue(new Error('nope'))
    const { result } = render({ defaultFps: 60 })

    act(() => result.current.onFpsDraftChange('240'))
    await act(async () => result.current.onFpsBlur())

    expect(toast.error).toHaveBeenCalledWith('nope')
    expect(result.current.fpsDraft).toBe('60')
  })
})
