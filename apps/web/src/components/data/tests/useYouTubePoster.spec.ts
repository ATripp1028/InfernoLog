import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SyntheticEvent } from 'react'
import { useYouTubePoster } from '../useYouTubePoster'

const ID = 'NjEiHIokTGM'
const url = (size: string) => `https://img.youtube.com/vi/${ID}/${size}.jpg`

const loaded = (naturalWidth: number) =>
  ({ currentTarget: { naturalWidth } }) as SyntheticEvent<HTMLImageElement>

describe('useYouTubePoster', () => {
  it('starts at the largest size, hidden until it proves real', () => {
    const { result } = renderHook(() => useYouTubePoster(ID))

    expect(result.current.src).toBe(url('maxresdefault'))
    expect(result.current.ready).toBe(false)
  })

  it('shows the first size that loads as a real poster', () => {
    const { result } = renderHook(() => useYouTubePoster(ID))

    act(() => result.current.onLoad(loaded(1280)))

    expect(result.current.src).toBe(url('maxresdefault'))
    expect(result.current.ready).toBe(true)
  })

  // The reported bug: a video without maxresdefault gets a grey stand-in that
  // fires `load`, not `error`, so an error-only fallback never ran.
  it('moves past a stand-in even though it loaded successfully', () => {
    const { result } = renderHook(() => useYouTubePoster(ID))

    act(() => result.current.onLoad(loaded(120)))

    expect(result.current.src).toBe(url('sddefault'))
    expect(result.current.ready).toBe(false)
  })

  it('moves past a size that fails to load outright', () => {
    const { result } = renderHook(() => useYouTubePoster(ID))

    act(() => result.current.onError())

    expect(result.current.src).toBe(url('sddefault'))
  })

  it('lands on hqdefault when both larger sizes are missing', () => {
    const { result } = renderHook(() => useYouTubePoster(ID))

    act(() => result.current.onLoad(loaded(120)))
    act(() => result.current.onLoad(loaded(120)))
    act(() => result.current.onLoad(loaded(480)))

    expect(result.current.src).toBe(url('hqdefault'))
    expect(result.current.ready).toBe(true)
  })

  // Better a bare scrim than a stretched grey placeholder.
  it('offers no poster once every size has failed', () => {
    const { result } = renderHook(() => useYouTubePoster(ID))

    act(() => result.current.onLoad(loaded(120)))
    act(() => result.current.onLoad(loaded(120)))
    act(() => result.current.onError())

    expect(result.current.src).toBeNull()
  })
})
