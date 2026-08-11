import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SEARCH_STATE,
  type SearchPageState,
} from '@/lib/levelSearchParams'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ href: '/search?query=x' }),
}))

const { useSearchPageBar } = await import('../useSearchPageBar')

const committed = (overrides: Partial<SearchPageState> = {}): SearchPageState =>
  ({ ...DEFAULT_SEARCH_STATE, ...overrides }) as SearchPageState

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function render(initial: SearchPageState = committed()) {
  return renderHook(
    ({ state }: { state: SearchPageState }) => useSearchPageBar(state),
    { initialProps: { state: initial } }
  )
}

/** Runs past the debounce window. */
const settle = () => act(() => void vi.advanceTimersByTime(500))

/** The search object of the most recent navigation. */
const pushed = () => navigate.mock.calls[navigate.mock.calls.length - 1]![0]

describe('useSearchPageBar', () => {
  describe('seeding from the URL', () => {
    it('starts from the committed query and mode', () => {
      const { result } = render(
        committed({ query: 'bloodbath', searchBy: 'creator' })
      )

      expect(result.current.query).toBe('bloodbath')
      expect(result.current.searchBy).toBe('creator')
    })

    it('starts blank when the URL carries no query', () => {
      expect(render().result.current.query).toBe('')
    })
  })

  // Typing commits into the URL by itself — no Enter required — but debounced
  // so every keystroke does not push a history entry.
  describe('the debounced live commit', () => {
    it('does not commit while the user is still typing', () => {
      const { result } = render()

      act(() => result.current.setQuery('blood'))

      expect(navigate).not.toHaveBeenCalled()
    })

    it('commits once the typing settles', () => {
      const { result } = render()

      act(() => result.current.setQuery('bloodbath'))
      settle()

      expect(pushed()).toMatchObject({
        to: '/search',
        replace: true,
        search: expect.objectContaining({ query: 'bloodbath' }),
      })
    })

    // `replace` rather than a push, so typing does not fill the back button
    // with every intermediate query.
    it('replaces rather than pushing a history entry', () => {
      const { result } = render()

      act(() => result.current.setQuery('bloodbath'))
      settle()

      expect(pushed().replace).toBe(true)
    })

    it('commits a mode switch too', () => {
      const { result } = render()

      act(() => result.current.setSearchBy('creator'))
      settle()

      expect(pushed().search).toMatchObject({ searchBy: 'creator' })
    })

    it('commits only once for a burst of keystrokes', () => {
      const { result } = render()

      act(() => result.current.setQuery('b'))
      act(() => result.current.setQuery('bl'))
      act(() => result.current.setQuery('blood'))
      settle()

      expect(navigate).toHaveBeenCalledTimes(1)
    })

    it('writes nothing when the value has not actually changed', () => {
      const { result } = render(committed({ query: 'bloodbath' }))

      act(() => result.current.setQuery('bloodbath'))
      settle()

      expect(navigate).not.toHaveBeenCalled()
    })

    it('trims the committed query', () => {
      const { result } = render()

      act(() => result.current.setQuery('  bloodbath  '))
      settle()

      expect(pushed().search.query).toBe('bloodbath')
    })

    // An empty box means no query, not an empty one — only the absent form
    // reads as "no constraint".
    it('clears the query rather than committing an empty string', () => {
      const { result } = render(committed({ query: 'bloodbath' }))

      act(() => result.current.setQuery('   '))
      settle()

      expect(pushed().search.query).toBeUndefined()
    })

    // Filters and sort live in the same URL; the bar must carry them through
    // rather than dropping them on every keystroke.
    it('preserves the filters and sort it did not touch', () => {
      const { result } = render(
        committed({ sort: 'likes', difficulty: ['demon-extreme'] })
      )

      act(() => result.current.setQuery('bloodbath'))
      settle()

      expect(pushed().search).toMatchObject({
        sort: 'likes',
        difficulty: ['demon-extreme'],
      })
    })

    // The committed state is read at fire time, so a filter changed mid-type
    // is not clobbered by a stale snapshot.
    it('reads the filters as they are when the debounce fires', () => {
      const { result, rerender } = render()

      act(() => result.current.setQuery('bloodbath'))
      rerender({ state: committed({ sort: 'downloads' }) })
      settle()

      expect(pushed().search).toMatchObject({ sort: 'downloads' })
    })
  })

  // A digits-only input is a level id, which jumps straight to that level's
  // page — a browse cannot auto-navigate on every keystroke.
  describe('a numeric input', () => {
    it('reads digits in name mode as a level id', () => {
      const { result } = render()

      act(() => result.current.setQuery('128'))

      expect(result.current.numericId).toBe('128')
    })

    // In creator mode a number is a (numeric) creator name to browse for.
    it('reads digits in creator mode as an ordinary query', () => {
      const { result } = render(committed({ searchBy: 'creator' }))

      act(() => result.current.setQuery('128'))

      expect(result.current.numericId).toBeNull()
    })

    it('is not a level id when mixed with letters', () => {
      const { result } = render()

      act(() => result.current.setQuery('128abc'))

      expect(result.current.numericId).toBeNull()
    })

    // A level id is not a browse term, so it must not commit as one.
    it('does not commit a level id as a query', () => {
      const { result } = render(committed({ query: 'bloodbath' }))

      act(() => result.current.setQuery('128'))
      settle()

      expect(pushed().search.query).toBeUndefined()
    })
  })

  describe('submitting', () => {
    it('jumps to the level page for a numeric id', () => {
      const { result } = render()
      act(() => result.current.setQuery('128'))

      act(() => result.current.submit())

      expect(pushed()).toMatchObject({
        to: '/levels/$levelId',
        params: { levelId: '128' },
      })
    })

    it('remembers where the jump came from', () => {
      const { result } = render()
      act(() => result.current.setQuery('128'))

      act(() => result.current.submit())

      expect(pushed().state).toBeDefined()
    })

    // Enter flushes the pending debounce so the search runs now rather than
    // after the remaining delay.
    it('flushes the pending query immediately', () => {
      const { result } = render()
      act(() => result.current.setQuery('bloodbath'))

      act(() => result.current.submit())

      expect(pushed().search).toMatchObject({ query: 'bloodbath' })
    })

    it('navigates to a level on demand', () => {
      const { result } = render()

      act(() => result.current.goToLevel('999'))

      expect(pushed()).toMatchObject({
        to: '/levels/$levelId',
        params: { levelId: '999' },
      })
    })
  })

  // Back/forward and in-app links change the URL from outside; the bar has to
  // follow those without mistaking its own debounced echo for one.
  describe('syncing back from the URL', () => {
    it('follows an external navigation', () => {
      const { result, rerender } = render(committed({ query: 'bloodbath' }))

      rerender({ state: committed({ query: 'cataclysm' }) })

      expect(result.current.query).toBe('cataclysm')
    })

    it('follows an external mode change', () => {
      const { result, rerender } = render()

      rerender({ state: committed({ searchBy: 'creator' }) })

      expect(result.current.searchBy).toBe('creator')
    })

    // Its own echo must not clobber what the user has typed since — that is
    // what the last-pushed refs are for.
    it('ignores the echo of its own commit', () => {
      const { result, rerender } = render()

      act(() => result.current.setQuery('bloodbath'))
      settle()
      // The URL now catches up to what we pushed, while the user has typed on.
      act(() => result.current.setQuery('bloodbath II'))
      rerender({ state: committed({ query: 'bloodbath' }) })

      expect(result.current.query).toBe('bloodbath II')
    })
  })
})
