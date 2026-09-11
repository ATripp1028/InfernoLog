import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { useHeroVideo } from '../useHeroVideo'

const YT = 'https://youtu.be/6v_pWirR72Q'
const CLIP = 'https://clips.twitch.tv/SomeFunnyClipName'
const clipPlayer = (slug: string) =>
  `https://clips.twitch.tv/embed?clip=${slug}&parent=${location.hostname}&autoplay=true`

const keyDown = (key: string) =>
  ({ key, preventDefault: () => {} }) as unknown as KeyboardEvent

describe('useHeroVideo', () => {
  // A facade in front of YouTube cost mobile viewers a second tap: theirs only
  // loaded the player, which then wouldn't start without another.
  it('loads a YouTube player with the page, with no facade to press', () => {
    const { result } = renderHook(() => useHeroVideo(YT))

    expect(result.current.player).toBe(
      'https://www.youtube-nocookie.com/embed/6v_pWirR72Q'
    )
  })

  it('holds a Twitch clip behind the facade until pressed', () => {
    const { result } = renderHook(() => useHeroVideo(CLIP))

    expect(result.current.player).toBeNull()
    expect(result.current.sourceLabel).toBe('📡 twitch.tv')

    act(() => result.current.play())

    expect(result.current.player).toBe(clipPlayer('SomeFunnyClipName'))
  })

  it.each(['Enter', ' '])('plays a clip from the keyboard with %j', (key) => {
    const { result } = renderHook(() => useHeroVideo(CLIP))

    act(() => result.current.onKeyDown(keyDown(key)))

    expect(result.current.player).toBe(clipPlayer('SomeFunnyClipName'))
  })

  it('has nothing to play for a URL with no embeddable id', () => {
    const { result } = renderHook(() =>
      useHeroVideo('https://www.youtube.com/@somechannel')
    )

    act(() => result.current.play())

    expect(result.current.player).toBeNull()
    expect(result.current.sourceLabel).toBe('▶ youtube.com')
  })

  it('starts a new clip back at its facade rather than autoplaying it', () => {
    const { result, rerender } = renderHook(({ url }) => useHeroVideo(url), {
      initialProps: { url: CLIP },
    })

    act(() => result.current.play())
    rerender({ url: 'https://clips.twitch.tv/AnotherClip' })

    expect(result.current.player).toBeNull()
  })
})
