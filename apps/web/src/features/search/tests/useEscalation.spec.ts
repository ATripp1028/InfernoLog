import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubMutation } from '@/utils/testUtils'

vi.mock('@/lib/api/logging', () => ({ useGdSearch: vi.fn() }))

const { useGdSearch } = await import('@/lib/api/logging')
const { useEscalation } = await import('../useEscalation')

let gdMutate: ReturnType<typeof vi.fn>
let gdReset: ReturnType<typeof vi.fn>

/** Points the underlying GD search at a given state. */
function gdSearchIs(overrides: Record<string, unknown> = {}) {
  vi.mocked(useGdSearch).mockReturnValue(
    stubMutation({ mutate: gdMutate, reset: gdReset, ...overrides })
  )
}

beforeEach(() => {
  gdMutate = vi.fn()
  gdReset = vi.fn()
  gdSearchIs()
})

const render = () => renderHook(() => useEscalation())

describe('useEscalation', () => {
  it('starts with nothing escalated', () => {
    const { result } = render()

    expect(result.current.escalatedQuery).toBeNull()
    expect(result.current.result).toBeNull()
  })

  describe('escalating', () => {
    it('forwards a bare query string to the GD search', () => {
      const { result } = render()

      act(() => result.current.escalate('bloodbath'))

      expect(gdMutate).toHaveBeenCalledWith('bloodbath')
      expect(result.current.escalatedQuery).toBe('bloodbath')
    })

    // The /search page escalates a whole state — filters and sort included —
    // rather than just a term, so the tracked query comes off its `query`.
    it('forwards a full search state, tracking its query term', () => {
      const { result } = render()
      const state = { query: 'bloodbath', sort: 'likes' }

      act(() => result.current.escalate(state as never))

      expect(gdMutate).toHaveBeenCalledWith(state)
      expect(result.current.escalatedQuery).toBe('bloodbath')
    })

    // A filters-only escalation has no query term, but is still escalated —
    // tracked as the empty string rather than null.
    it('tracks a state with no query term as escalated', () => {
      const { result } = render()

      act(() => result.current.escalate({ sort: 'likes' } as never))

      expect(result.current.escalatedQuery).toBe('')
    })
  })

  // Escalation is an action, never a mode the user is left in: editing the
  // query drops the result so the next one needs its own confirmation.
  describe('clearing', () => {
    it('forgets the escalated query', () => {
      const { result } = render()
      act(() => result.current.escalate('bloodbath'))

      act(() => result.current.clear())

      expect(result.current.escalatedQuery).toBeNull()
    })

    it('discards the result the escalation produced', () => {
      const { result } = render()
      act(() => result.current.escalate('bloodbath'))

      act(() => result.current.clear())

      expect(gdReset).toHaveBeenCalled()
    })

    // Nothing to reset when nothing was escalated — this fires on every
    // keystroke, so it must not churn the mutation state.
    it('does nothing when there was no escalation', () => {
      const { result } = render()

      act(() => result.current.clear())

      expect(gdReset).not.toHaveBeenCalled()
    })

    it('does nothing on a second clear', () => {
      const { result } = render()
      act(() => result.current.escalate('bloodbath'))
      act(() => result.current.clear())
      gdReset.mockClear()

      act(() => result.current.clear())

      expect(gdReset).not.toHaveBeenCalled()
    })
  })

  describe('reporting the request', () => {
    it('reports an in-flight escalation', () => {
      gdSearchIs({ isPending: true })

      expect(render().result.current.isPending).toBe(true)
    })

    // A 503 resolves to an 'unreachable' RESULT rather than an error, so
    // isError means something genuinely unexpected.
    it('reports an unexpected failure', () => {
      gdSearchIs({ isError: true })

      expect(render().result.current.isError).toBe(true)
    })

    it.each([
      ['results', { status: 'ok', rated: [], unrated: [] }],
      ['nothing new', { status: 'nothing_new', totalFound: 5 }],
      ['an unreachable server', { status: 'unreachable' }],
    ])('surfaces %s as a result', (_label, data) => {
      gdSearchIs({ data })

      expect(render().result.current.result).toEqual(data)
    })

    it('reports no result before anything comes back', () => {
      gdSearchIs({ data: undefined })

      expect(render().result.current.result).toBeNull()
    })
  })

  // The flow's callbacks depend on these, so a fresh identity every render
  // would make their useCallbacks meaningless.
  it('keeps stable action identities across re-renders', () => {
    const { result, rerender } = render()
    const { escalate, clear } = result.current

    rerender()

    expect(result.current.escalate).toBe(escalate)
    expect(result.current.clear).toBe(clear)
  })
})
