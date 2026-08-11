import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from '../useMediaQuery'

/** A controllable MediaQueryList, since jsdom never actually matches. */
class FakeMql {
  matches = false
  listeners = new Set<() => void>()
  constructor(public media: string) {}
  addEventListener(_: string, fn: () => void) {
    this.listeners.add(fn)
  }
  removeEventListener(_: string, fn: () => void) {
    this.listeners.delete(fn)
  }
  /** Simulates the viewport crossing the breakpoint. */
  set(matches: boolean) {
    this.matches = matches
    for (const fn of this.listeners) fn()
  }
}

let mqls: Map<string, FakeMql>

beforeEach(() => {
  mqls = new Map()
  vi.stubGlobal('matchMedia', (query: string) => {
    const existing = mqls.get(query)
    if (existing) return existing
    const mql = new FakeMql(query)
    mqls.set(query, mql)
    return mql
  })
})

const MD = '(min-width: 768px)'
const mql = (query = MD) => mqls.get(query)!

describe('useMediaQuery', () => {
  it('reports the query’s state on mount', () => {
    // Register a match before the hook ever asks.
    const pre = new FakeMql(MD)
    pre.matches = true
    mqls.set(MD, pre)

    expect(renderHook(() => useMediaQuery(MD)).result.current).toBe(true)
  })

  it('reports a query that does not match', () => {
    expect(renderHook(() => useMediaQuery(MD)).result.current).toBe(false)
  })

  it('asks about the query it was given', () => {
    renderHook(() => useMediaQuery(MD))

    expect(mqls.has(MD)).toBe(true)
  })

  // Resizing across the breakpoint has to re-render, or the List panel stays
  // docked after the window shrinks.
  it('follows the viewport across the breakpoint', () => {
    const { result } = renderHook(() => useMediaQuery(MD))

    act(() => mql().set(true))

    expect(result.current).toBe(true)
  })

  it('follows it back', () => {
    const { result } = renderHook(() => useMediaQuery(MD))
    act(() => mql().set(true))

    act(() => mql().set(false))

    expect(result.current).toBe(false)
  })

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useMediaQuery(MD))

    unmount()

    expect(mql().listeners.size).toBe(0)
  })

  it('switches to a new query when it changes', () => {
    const LG = '(min-width: 1024px)'
    const { rerender } = renderHook(({ q }) => useMediaQuery(q), {
      initialProps: { q: MD },
    })

    rerender({ q: LG })

    expect(mqls.has(LG)).toBe(true)
    expect(mql(MD).listeners.size).toBe(0)
  })
})
