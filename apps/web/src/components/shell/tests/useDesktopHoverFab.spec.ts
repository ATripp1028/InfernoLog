import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_DELAY_MS, useDesktopHoverFab } from '../useDesktopHoverFab'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const render = () => renderHook(() => useDesktopHoverFab())

/** Runs past the close grace period. */
const settle = () =>
  act(() => void vi.advanceTimersByTime(CLOSE_DELAY_MS + 1))

/** Attaches the hook's ref to a real element so `contains` works. */
function mountContainer(
  result: { current: ReturnType<typeof useDesktopHoverFab> }
): { container: HTMLDivElement; inside: HTMLButtonElement } {
  const container = document.createElement('div')
  const inside = document.createElement('button')
  container.appendChild(inside)
  document.body.appendChild(container)
  // Test-only: the component would set this via its ref prop.
  ;(result.current.containerRef as { current: HTMLDivElement | null }).current =
    container
  return { container, inside }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useDesktopHoverFab', () => {
  it('starts collapsed', () => {
    expect(render().result.current.expanded).toBe(false)
  })

  it('expands on hover', () => {
    const { result } = render()

    act(() => result.current.openGroup())

    expect(result.current.expanded).toBe(true)
  })

  // Closing on the grace delay gives the cursor room to cross the gaps
  // between buttons without the stack collapsing under it.
  describe('the close grace period', () => {
    it('stays open immediately after the pointer leaves', () => {
      const { result } = render()
      act(() => result.current.openGroup())

      act(() => result.current.scheduleClose())

      expect(result.current.expanded).toBe(true)
    })

    it('closes once the delay elapses', () => {
      const { result } = render()
      act(() => result.current.openGroup())
      act(() => result.current.scheduleClose())

      settle()

      expect(result.current.expanded).toBe(false)
    })

    // Overshooting and coming back is the case the delay exists for.
    it('cancels a pending close when the pointer returns', () => {
      const { result } = render()
      act(() => result.current.openGroup())
      act(() => result.current.scheduleClose())

      act(() => result.current.openGroup())
      settle()

      expect(result.current.expanded).toBe(true)
    })

    // Otherwise the first leave's timer would close the group mid-hover.
    it('restarts the delay on a second leave', () => {
      const { result } = render()
      act(() => result.current.openGroup())
      act(() => result.current.scheduleClose())

      act(() => void vi.advanceTimersByTime(CLOSE_DELAY_MS - 50))
      act(() => result.current.scheduleClose())
      act(() => void vi.advanceTimersByTime(CLOSE_DELAY_MS - 50))

      expect(result.current.expanded).toBe(true)
    })

    // A timer firing after unmount would set state on a dead component.
    it('drops a pending close on unmount', () => {
      const { result, unmount } = render()
      act(() => result.current.openGroup())
      act(() => result.current.scheduleClose())

      unmount()

      expect(() => vi.runAllTimers()).not.toThrow()
    })
  })

  describe('keyboard focus', () => {
    it('expands when focus enters the group', () => {
      const { result } = render()

      act(() => result.current.openGroup())

      expect(result.current.expanded).toBe(true)
    })

    // Tabbing between two buttons inside the group fires a blur that must not
    // collapse the stack out from under the user.
    it('stays open while focus moves within the group', () => {
      const { result } = render()
      const { inside } = mountContainer(result)
      act(() => result.current.openGroup())

      act(() => result.current.handleBlur(inside))
      settle()

      expect(result.current.expanded).toBe(true)
    })

    it('closes once focus leaves the group', () => {
      const { result } = render()
      mountContainer(result)
      act(() => result.current.openGroup())

      act(() => result.current.handleBlur(document.body))
      settle()

      expect(result.current.expanded).toBe(false)
    })

    // Tabbing to the browser chrome leaves nothing focused at all.
    it('closes when focus leaves the page entirely', () => {
      const { result } = render()
      mountContainer(result)
      act(() => result.current.openGroup())

      act(() => result.current.handleBlur(null))
      settle()

      expect(result.current.expanded).toBe(false)
    })
  })

  // These listen on the document because the container's own handlers only
  // fire when focus is inside it — which hover-only expansion never
  // establishes.
  describe('dismissing', () => {
    const press = (key: string) =>
      act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key })))

    it('closes on Escape, with no delay', () => {
      const { result } = render()
      act(() => result.current.openGroup())

      press('Escape')

      expect(result.current.expanded).toBe(false)
    })

    it('ignores other keys', () => {
      const { result } = render()
      act(() => result.current.openGroup())

      press('a')

      expect(result.current.expanded).toBe(true)
    })

    it('closes on a click outside', () => {
      const { result } = render()
      mountContainer(result)
      act(() => result.current.openGroup())

      act(() => {
        document.body.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true })
        )
      })

      expect(result.current.expanded).toBe(false)
    })

    // Clicking an action must run it, not dismiss the group first.
    it('stays open on a click inside', () => {
      const { result } = render()
      const { inside } = mountContainer(result)
      act(() => result.current.openGroup())

      act(() => {
        inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })

      expect(result.current.expanded).toBe(true)
    })

    // Nothing to dismiss while collapsed, so the document should be quiet.
    it('listens only while expanded', () => {
      const add = vi.spyOn(document, 'addEventListener')
      const { result } = render()

      expect(add).not.toHaveBeenCalledWith('keydown', expect.anything())

      act(() => result.current.openGroup())

      expect(add).toHaveBeenCalledWith('keydown', expect.anything())
    })

    it('stops listening once collapsed again', () => {
      const remove = vi.spyOn(document, 'removeEventListener')
      const { result } = render()
      act(() => result.current.openGroup())

      press('Escape')

      expect(remove).toHaveBeenCalledWith('keydown', expect.anything())
    })
  })
})
