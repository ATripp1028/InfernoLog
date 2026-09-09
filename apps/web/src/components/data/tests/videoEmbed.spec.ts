import { describe, expect, it } from 'vitest'
import {
  detectSource,
  extractTwitchClipSlug,
  extractYouTubeId,
} from '../videoEmbed'

describe('extractYouTubeId', () => {
  // Users paste whatever their browser gave them, which is a different URL
  // shape depending on where they copied it from.
  it.each([
    ['a watch link', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['a shortener', 'https://youtu.be/dQw4w9WgXcQ'],
    ['a Short', 'https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['an embed', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    [
      'a watch link with extra params',
      'https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=42s',
    ],
    ['a timestamped shortener', 'https://youtu.be/dQw4w9WgXcQ?t=90'],
    ['an http link', 'http://youtube.com/watch?v=dQw4w9WgXcQ'],
  ])('reads the id from %s', (_label, url) => {
    expect(extractYouTubeId(url)).toBe('dQw4w9WgXcQ')
  })

  // Ids are exactly 11 characters; a shorter match would produce a broken
  // embed rather than falling back to a plain link.
  it('ignores a too-short id', () => {
    expect(extractYouTubeId('https://youtu.be/short')).toBeNull()
  })

  it('reads only the first 11 characters of an over-long path', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQextra')).toBe(
      'dQw4w9WgXcQ'
    )
  })

  it.each([
    ['a channel page', 'https://www.youtube.com/@somechannel'],
    ['a bare host', 'https://youtube.com'],
    ['an unrelated URL', 'https://example.com/video'],
    ['empty text', ''],
  ])('finds no id in %s', (_label, url) => {
    expect(extractYouTubeId(url)).toBeNull()
  })

  it('accepts ids containing underscores and hyphens', () => {
    expect(extractYouTubeId('https://youtu.be/a_b-c_d-e_f')).toBe('a_b-c_d-e_f')
  })
})

describe('extractTwitchClipSlug', () => {
  it('reads the slug from a clip URL', () => {
    expect(
      extractTwitchClipSlug('https://clips.twitch.tv/SomeFunnyClipName')
    ).toBe('SomeFunnyClipName')
  })

  it('accepts a slug with underscores and hyphens', () => {
    expect(extractTwitchClipSlug('https://clips.twitch.tv/Some_Clip-42')).toBe(
      'Some_Clip-42'
    )
  })

  it.each([
    ['a channel page', 'https://www.twitch.tv/somestreamer'],
    ['a VOD', 'https://www.twitch.tv/videos/123456'],
    ['an unrelated URL', 'https://example.com/clip'],
  ])('finds no slug in %s', (_label, url) => {
    expect(extractTwitchClipSlug(url)).toBeNull()
  })
})

describe('detectSource', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/@channel',
  ])('recognizes %s as YouTube', (url) => {
    expect(detectSource(url)).toBe('youtube')
  })

  it.each([
    'https://clips.twitch.tv/SomeClip',
    'https://www.twitch.tv/somestreamer',
  ])('recognizes %s as Twitch', (url) => {
    expect(detectSource(url)).toBe('twitch-clip')
  })

  it.each(['https://example.com/video.mp4', 'https://vimeo.com/123456', ''])(
    'treats %s as an unknown source',
    (url) => {
      expect(detectSource(url)).toBe('unknown')
    }
  )

  // Source is judged by host alone, so a recognized host with an unusable
  // path still reports its source — the id extractors decide whether an
  // embed is actually possible.
  it('reports a source even when no id can be extracted', () => {
    const url = 'https://www.youtube.com/@somechannel'

    expect(detectSource(url)).toBe('youtube')
    expect(extractYouTubeId(url)).toBeNull()
  })
})
