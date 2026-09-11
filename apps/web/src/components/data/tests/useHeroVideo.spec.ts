import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { useMe, type MeData } from '@/lib/api/me'
import { makeMe, stubQuery } from '@/utils/testUtils'
import { useHeroVideo } from '../useHeroVideo'

vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))

const YT = 'https://youtu.be/6v_pWirR72Q'
const YT_PLAYER = 'https://www.youtube-nocookie.com/embed/6v_pWirR72Q'
const CLIP = 'https://clips.twitch.tv/SomeFunnyClipName'
const clipPlayer = (slug: string) =>
  `https://clips.twitch.tv/embed?clip=${slug}&parent=${location.hostname}&autoplay=true`

const keyDown = (key: string) =>
  ({ key, preventDefault: () => {} }) as unknown as KeyboardEvent

function consent(youtubeEmbedConsent: boolean) {
  vi.mocked(useMe).mockReturnValue(
    stubQuery<MeData>({ data: makeMe({ youtubeEmbedConsent }) })
  )
}

beforeEach(() => {
  consent(true)
})

describe('useHeroVideo', () => {
  describe('YouTube', () => {
    // A facade in front of YouTube cost mobile viewers a second tap: theirs
    // only loaded the player, which then wouldn't start without another.
    it('loads the player with the page once the viewer allows it', () => {
      const { result } = renderHook(() => useHeroVideo(YT))

      expect(result.current.player).toBe(YT_PLAYER)
    })

    it('waits behind the facade until the viewer allows it', () => {
      consent(false)

      const { result } = renderHook(() => useHeroVideo(YT))

      expect(result.current.player).toBeNull()
      expect(result.current.sourceLabel).toBe('▶ youtube.com')
    })

    it('starts a pressed video rather than waiting for a second press', () => {
      consent(false)
      const { result } = renderHook(() => useHeroVideo(YT))

      act(() => result.current.play())

      expect(result.current.player).toBe(`${YT_PLAYER}?autoplay=1`)
    })

    // Nothing reaches YouTube on a guess.
    it('treats consent as not given while the account is still loading', () => {
      vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ isPending: true }))

      const { result } = renderHook(() => useHeroVideo(YT))

      expect(result.current.player).toBeNull()
    })
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
