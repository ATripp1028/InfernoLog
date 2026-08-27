import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backOriginState } from '../backOrigin'

const { navigate, historyBack, location } = vi.hoisted(() => ({
  navigate: vi.fn(),
  historyBack: vi.fn(),
  location: { state: {} as unknown },
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => location,
  useNavigate: () => navigate,
  useRouter: () => ({ history: { back: historyBack } }),
}))

const { useGoBack } = await import('../useGoBack')

/** jsdom's history.length is a getter, so it has to be redefined. */
function historyEntries(length: number) {
  Object.defineProperty(window.history, 'length', {
    configurable: true,
    get: () => length,
  })
}

beforeEach(() => {
  location.state = {}
  historyEntries(1)
})

afterEach(() => {
  Reflect.deleteProperty(window.history, 'length')
})

const render = (fallback = '/log') => renderHook(() => useGoBack(fallback))

describe('useGoBack', () => {
  // Reached via an in-app link, which recorded where from.
  describe('with a remembered origin', () => {
    beforeEach(() => {
      location.state = backOriginState('/log?sort=likes')
      // Even with history available, the remembered origin wins.
      historyEntries(5)
    })

    it('goes to the remembered href', () => {
      expect(render().result.current.href).toBe('/log?sort=likes')
    })

    // Replaces so a Back-then-Back does not land the user right back on the
    // page they just left.
    it('replaces rather than pushing', () => {
      expect(render().result.current.replace).toBe(true)
    })

    // Lets callers say "Back to the list" rather than a bare "Back".
    it('reports that the destination is the origin', () => {
      expect(render().result.current.isOrigin).toBe(true)
    })

    it('navigates to the origin when clicked', () => {
      render().result.current.onClick()

      expect(navigate).toHaveBeenCalledWith({
        href: '/log?sort=likes',
        replace: true,
      })
    })
  })

  // A hard refresh or a shared link loses the state, but the user may still
  // have somewhere to go back to.
  describe('with history but no remembered origin', () => {
    beforeEach(() => historyEntries(5))

    // No representable URL for a history pop, so callers render a button.
    it('offers no href', () => {
      expect(render().result.current.href).toBeUndefined()
    })

    it('pops the browser history when clicked', () => {
      render().result.current.onClick()

      expect(historyBack).toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
    })

    it('does not claim the origin was used', () => {
      expect(render().result.current.isOrigin).toBe(false)
    })
  })

  // A pasted link opened in a fresh tab: nothing to go back to at all.
  describe('with neither an origin nor history', () => {
    it('falls back to the caller’s route', () => {
      expect(render('/log').result.current.href).toBe('/log')
    })

    it('pushes rather than replacing, so this page stays in history', () => {
      expect(render().result.current.replace).toBe(false)
    })

    it('navigates to the fallback when clicked', () => {
      render('/log').result.current.onClick()

      expect(navigate).toHaveBeenCalledWith({ to: '/log' })
      expect(historyBack).not.toHaveBeenCalled()
    })

    it('does not claim the origin was used', () => {
      expect(render().result.current.isOrigin).toBe(false)
    })

    it('honours whatever fallback the caller gave', () => {
      expect(render('/levels/128').result.current.href).toBe('/levels/128')
    })
  })

  it('ignores unrelated router state', () => {
    location.state = { somethingElse: 1 }
    historyEntries(5)

    expect(render().result.current.isOrigin).toBe(false)
  })
})
