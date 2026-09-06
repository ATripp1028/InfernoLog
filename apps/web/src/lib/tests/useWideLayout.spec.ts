import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWideLayout, WIDE_LAYOUT_QUERY } from '../useWideLayout'

/** Answers `matchMedia` the way a viewport of this size would. */
function stubViewport(width: number, height: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const minWidth = /min-width:\s*(\d+)px/.exec(query)
    const minHeight = /min-height:\s*(\d+)px/.exec(query)
    const matches =
      (!minWidth || width >= Number(minWidth[1])) &&
      (!minHeight || height >= Number(minHeight[1]))
    return {
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  })
}

const asked = () => renderHook(() => useWideLayout()).result.current

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('useWideLayout', () => {
  it('takes both dimensions into account', () => {
    expect(WIDE_LAYOUT_QUERY).toContain('min-width')
    expect(WIDE_LAYOUT_QUERY).toContain('min-height')
  })

  it('is wide on a desktop viewport', () => {
    stubViewport(1440, 900)

    expect(asked()).toBe(true)
  })

  it('is not wide on a phone in portrait', () => {
    stubViewport(390, 844)

    expect(asked()).toBe(false)
  })

  // The bug this hook exists for: a phone in landscape clears `md`, and a
  // width-only test hands it the two-column layout.
  it('is not wide on a phone in landscape', () => {
    stubViewport(844, 390)

    expect(asked()).toBe(false)
  })

  it('is still wide on the shortest tablet in landscape', () => {
    stubViewport(1133, 744)

    expect(asked()).toBe(true)
  })

  it('is wide on a tablet in portrait', () => {
    stubViewport(810, 1080)

    expect(asked()).toBe(true)
  })
})
