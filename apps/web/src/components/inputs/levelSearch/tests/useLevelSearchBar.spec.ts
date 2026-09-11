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

const { useLevelSearchBar } = await import('../useLevelSearchBar')

const committed = (overrides: Partial<SearchPageState> = {}): SearchPageState =>
  ({ ...DEFAULT_SEARCH_STATE, ...overrides }) as SearchPageState

// Where the bar writes the search. The hosting page owns the route (and the
// replace-not-push), so here it is only a spy.
const commit = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  commit.mockReset()
  navigate.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

function render(
  initial: SearchPageState = committed(),
  options: { levelIdJump?: boolean } = {}
) {
  return renderHook(
    ({ state }: { state: SearchPageState }) =>
      useLevelSearchBar(state, { commit, ...options }),
    { initialProps: { state: initial } }
  )
}

/** Runs past the debounce window. */
const settle = () => act(() => void vi.advanceTimersByTime(500))

/** The search state of the most recent commit. */
const lastCommit = () =>
  commit.mock.calls[commit.mock.calls.length - 1]![0] as SearchPageState

/** The options of the most recent navigation — only level jumps navigate. */
const lastNavigation = () =>
  navigate.mock.calls[navigate.mock.calls.length - 1]![0]

describe('useLevelSearchBar', () => {
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

  // Typing commits by itself — no Enter required — but debounced so every
  // keystroke does not become a navigation.
  describe('the debounced live commit', () => {
    it('does not commit while the user is still typing', () => {
      const { result } = render()

      act(() => result.current.setQuery('blood'))

      expect(commit).not.toHaveBeenCalled()
    })

    it('commits once the typing settles', () => {
      const { result } = render()

      act(() => result.current.setQuery('bloodbath'))
      settle()

      expect(lastCommit()).toMatchObject({ query: 'bloodbath' })
    })

    it('commits a mode switch too', () => {
      const { result } = render()

      act(() => result.current.setSearchBy('creator'))
      settle()

      expect(lastCommit()).toMatchObject({ searchBy: 'creator' })
    })

    it('commits only once for a burst of keystrokes', () => {
      const { result } = render()

      act(() => result.current.setQuery('b'))
      act(() => result.current.setQuery('bl'))
      act(() => result.current.setQuery('blood'))
      settle()

      expect(commit).toHaveBeenCalledTimes(1)
    })

    it('writes nothing when the value has not actually changed', () => {
      const { result } = render(committed({ query: 'bloodbath' }))

      act(() => result.current.setQuery('bloodbath'))
      settle()

      expect(commit).not.toHaveBeenCalled()
    })

    it('trims the committed query', () => {
      const { result } = render()

      act(() => result.current.setQuery('  bloodbath  '))
      settle()

      expect(lastCommit().query).toBe('bloodbath')
    })

    // An empty box means no query, not an empty one — only the absent form
    // reads as "no constraint".
    it('clears the query rather than committing an empty string', () => {
      const { result } = render(committed({ query: 'bloodbath' }))

      act(() => result.current.setQuery('   '))
      settle()

      expect(lastCommit().query).toBeUndefined()
    })

    // Filters and sort live in the same URL; the bar must carry them through
    // rather than dropping them on every keystroke.
    it('preserves the filters and sort it did not touch', () => {
      const { result } = render(
        committed({ sort: 'likes', difficulty: ['demon-extreme'] })
      )

      act(() => result.current.setQuery('bloodbath'))
      settle()

      expect(lastCommit()).toMatchObject({
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

      expect(lastCommit()).toMatchObject({ sort: 'downloads' })
    })

    // Pages pass a fresh arrow every render; that must not restart the timer.
    it('uses the latest commit callback without restarting the debounce', () => {
      const { result, rerender } = render()
      const later = vi.fn()

      act(() => result.current.setQuery('bloodbath'))
      act(() => void vi.advanceTimersByTime(200))
      rerender({ state: committed() })
      act(() => void vi.advanceTimersByTime(100))

      expect(commit).toHaveBeenCalledOnce()
      expect(later).not.toHaveBeenCalled()
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

      expect(lastCommit().query).toBeUndefined()
    })
  })

  // A collection's bar: its browse matches a number against its own levels'
  // ids, so a number is a query like any other rather than a jump.
  describe('without level-id jumps', () => {
    it('reads digits as an ordinary query', () => {
      const { result } = render(committed(), { levelIdJump: false })

      act(() => result.current.setQuery('128'))

      expect(result.current.numericId).toBeNull()
    })

    it('commits the digits as the query', () => {
      const { result } = render(committed(), { levelIdJump: false })

      act(() => result.current.setQuery('128'))
      settle()

      expect(lastCommit()).toMatchObject({ query: '128' })
    })

    it('submits the digits as a search instead of navigating', () => {
      const { result } = render(committed(), { levelIdJump: false })
      act(() => result.current.setQuery('128'))

      act(() => result.current.submit())

      expect(lastCommit()).toMatchObject({ query: '128' })
      expect(navigate).not.toHaveBeenCalled()
    })
  })

  describe('submitting', () => {
    it('jumps to the level page for a numeric id', () => {
      const { result } = render()
      act(() => result.current.setQuery('128'))

      act(() => result.current.submit())

      expect(lastNavigation()).toMatchObject({
        to: '/levels/$levelId',
        params: { levelId: '128' },
      })
    })

    it('remembers where the jump came from', () => {
      const { result } = render()
      act(() => result.current.setQuery('128'))

      act(() => result.current.submit())

      expect(lastNavigation().state).toBeDefined()
    })

    // Enter flushes the pending debounce so the search runs now rather than
    // after the remaining delay.
    it('flushes the pending query immediately', () => {
      const { result } = render()
      act(() => result.current.setQuery('bloodbath'))

      act(() => result.current.submit())

      expect(lastCommit()).toMatchObject({ query: 'bloodbath' })
    })

    it('navigates to a level on demand', () => {
      const { result } = render()

      act(() => result.current.goToLevel('999'))

      expect(lastNavigation()).toMatchObject({
        to: '/levels/$levelId',
        params: { levelId: '999' },
      })
    })
  })

  describe('the filter panel', () => {
    it('starts closed when the URL carries no filters', () => {
      expect(render().result.current.filtersOpen).toBe(false)
    })

    // A shared or restored search should show what it is filtering on.
    it.each([
      ['a chip filter', { difficulty: ['demon-extreme'] }],
      ['a range bound', { downloadsMin: 1000 }],
    ] as const)('starts open when the URL carries %s', (_label, patch) => {
      expect(
        render(committed(patch as Partial<SearchPageState>)).result.current
          .filtersOpen
      ).toBe(true)
    })

    it('toggles open and closed', () => {
      const { result } = render()

      act(() => result.current.toggleFilters())
      expect(result.current.filtersOpen).toBe(true)

      act(() => result.current.toggleFilters())
      expect(result.current.filtersOpen).toBe(false)
    })

    // Opening the panel is view state, not search state — it must not touch
    // the URL or re-run the results.
    it('does not commit or navigate', () => {
      const { result } = render()

      act(() => result.current.toggleFilters())
      settle()

      expect(commit).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
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
