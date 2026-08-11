import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS } from '@infernolog/core'
import type { MeData } from '@/lib/api/me'
import { stubQuery } from '@/utils/testUtils'
import type { FlowDraft } from '../../types'
import { draft, level, me as meData } from '../../tests/fixtures'

// The step reads the flow through context and the viewer through /me;
// stubbing those two is enough to drive it.
vi.mock('../../LoggingFlowProvider', () => ({ useLoggingFlow: vi.fn() }))
vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))

const { useLoggingFlow } = await import('../../LoggingFlowProvider')
const { useMe } = await import('@/lib/api/me')
const { useCompletionBasicsStep } = await import('../useCompletionBasicsStep')

let patchDraft: ReturnType<typeof vi.fn>
let setStep: ReturnType<typeof vi.fn>

beforeEach(() => {
  patchDraft = vi.fn()
  setStep = vi.fn()
  vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: meData() }))
})

function render(
  opts: {
    draft?: Partial<FlowDraft>
    level?: Parameters<typeof level>[0] | null
    defaultPercentageVersion?: 'TWO_ONE' | 'TWO_TWO' | null
  } = {}
) {
  if (opts.defaultPercentageVersion !== undefined) {
    vi.mocked(useMe).mockReturnValue(
      stubQuery<MeData>({
        data: meData({
          defaultPercentageVersion: opts.defaultPercentageVersion,
        }),
      })
    )
  }
  vi.mocked(useLoggingFlow).mockReturnValue({
    level: opts.level === null ? null : level(opts.level ?? {}),
    draft: draft(opts.draft ?? {}),
    patchDraft,
    setStep,
  } as never)
  return renderHook(() => useCompletionBasicsStep())
}

/** The fields patched onto the draft by the step's effects. */
const patched = () =>
  Object.assign(
    {},
    ...patchDraft.mock.calls.map((c) => c[0])
  ) as Partial<FlowDraft>

describe('useCompletionBasicsStep', () => {
  describe('seeding the percentage basis', () => {
    it('fills in the viewer’s default when the draft has none', () => {
      render({
        draft: { percentageVersion: null },
        defaultPercentageVersion: 'TWO_ONE',
      })

      expect(patched().percentageVersion).toBe('TWO_ONE')
    })

    // 2.2 is the current basis, so a viewer with no preference logs on it.
    it('falls back to 2.2 when the viewer has no preference', () => {
      render({
        draft: { percentageVersion: null },
        defaultPercentageVersion: null,
      })

      expect(patched().percentageVersion).toBe('TWO_TWO')
    })

    it('leaves a basis the draft already carries', () => {
      render({
        draft: { percentageVersion: 'TWO_ONE', date: '2026-03-14' },
        defaultPercentageVersion: 'TWO_TWO',
      })

      expect(patchDraft).not.toHaveBeenCalled()
    })
  })

  // A pre-2.2 date pins the basis: 2.2's time-based percentages did not
  // exist yet, so there is nothing to choose.
  describe('a pre-2.2 date', () => {
    it('forces the basis to 2.1', () => {
      render({ draft: { date: '2020-01-01', percentageVersion: 'TWO_TWO' } })

      expect(patched().percentageVersion).toBe('TWO_ONE')
    })

    it('hides the version picker', () => {
      const { result } = render({ draft: { date: '2020-01-01' } })

      expect(result.current.showVersionPicker).toBe(false)
    })

    it('leaves a post-2.2 date alone', () => {
      const { result } = render({
        draft: { date: '2026-03-14', percentageVersion: 'TWO_TWO' },
      })

      expect(result.current.showVersionPicker).toBe(true)
      expect(patchDraft).not.toHaveBeenCalled()
    })

    it('re-pins the basis when the date changes to a pre-2.2 one', () => {
      const { rerender } = renderHook(
        ({ date }: { date: string }) => {
          vi.mocked(useLoggingFlow).mockReturnValue({
            level: level(),
            draft: draft({ date, percentageVersion: 'TWO_TWO' }),
            patchDraft,
            setStep,
          } as never)
          return useCompletionBasicsStep()
        },
        { initialProps: { date: '2026-03-14' } }
      )
      patchDraft.mockClear()

      act(() => rerender({ date: '2020-01-01' }))

      expect(patched().percentageVersion).toBe('TWO_ONE')
    })
  })

  describe('the version picker', () => {
    it('appears for a classic level', () => {
      const { result } = render({ level: { levelType: 'CLASSIC' } })

      expect(result.current.showVersionPicker).toBe(true)
    })

    // A platformer has no percentage basis at all.
    it('is hidden for a platformer', () => {
      const { result } = render({ level: { levelType: 'PLATFORMER' } })

      expect(result.current.showVersionPicker).toBe(false)
    })

    it('is hidden before a level has resolved', () => {
      const { result } = render({ level: null })

      expect(result.current.showVersionPicker).toBe(false)
    })
  })

  describe('validation', () => {
    it('accepts an attempts count inside the bound', () => {
      const { result } = render({ draft: { attempts: '4200' } })

      expect(result.current.attemptsError).toBeNull()
    })

    it('accepts a blank attempts count, since the field is optional', () => {
      const { result } = render({ draft: { attempts: '' } })

      expect(result.current.attemptsError).toBeNull()
    })

    it('rejects an attempts count over the bound', () => {
      const { result } = render({
        draft: { attempts: String(MAX_ATTEMPTS + 1) },
      })

      expect(result.current.attemptsError).not.toBeNull()
    })
  })

  it('passes the flow’s own handles straight through', () => {
    const { result } = render()

    expect(result.current.patchDraft).toBe(patchDraft)
    expect(result.current.setStep).toBe(setStep)
    expect(result.current.level).not.toBeNull()
  })
})
