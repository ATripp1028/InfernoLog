import { describe, expect, it } from 'vitest'
import { makeGlobalLevel } from '@/utils/testUtils'
import {
  aredlLevelUrl,
  copiedFromLevelId,
  gdBrowserLevelUrl,
  gdBrowserUserUrl,
  gddlLevelUrl,
  youtubeSearchUrl,
} from '../linkTargets'

describe('external link builders', () => {
  it.each([
    [gdBrowserLevelUrl, '128', 'https://gdbrowser.com/128'],
    [gdBrowserUserUrl, '71', 'https://gdbrowser.com/u/71'],
    [gddlLevelUrl, '128', 'https://gdladder.com/level/128'],
    [aredlLevelUrl, '128', 'https://aredl.net/list/128'],
  ])('builds %o for %s', (build, id, expected) => {
    expect(build(id)).toBe(expected)
  })
})

describe('youtubeSearchUrl', () => {
  const search = (level: Parameters<typeof youtubeSearchUrl>[0]) =>
    decodeURIComponent(
      youtubeSearchUrl(level).split('search_query=')[1]!.replace(/\+/g, ' ')
    )

  it('scopes the search to the game, the level, its creator, and its id', () => {
    const level = makeGlobalLevel({
      name: 'Bloodbath',
      creator: 'Riot',
      inGameId: '10565740',
    })

    expect(search(level)).toBe('Geometry Dash Bloodbath by Riot 10565740')
  })

  // Missing fields are dropped rather than rendered as blanks — a query with
  // "undefined" or a double space in it finds nothing useful.
  it('drops an unknown creator', () => {
    const level = makeGlobalLevel({
      name: 'Bloodbath',
      creator: null,
      inGameId: '10565740',
    })

    expect(search(level)).toBe('Geometry Dash Bloodbath 10565740')
  })

  it('drops an unknown name', () => {
    const level = makeGlobalLevel({
      name: null,
      creator: 'Riot',
      inGameId: '10565740',
    })

    expect(search(level)).toBe('Geometry Dash by Riot 10565740')
  })

  it('still searches something for a level with neither', () => {
    const level = makeGlobalLevel({
      name: null,
      creator: null,
      inGameId: '10565740',
    })

    expect(search(level)).toBe('Geometry Dash 10565740')
  })

  // YouTube's own URLs use '+' for spaces; %20 works but looks wrong when a
  // user copies the link out of the address bar.
  it('renders spaces as + rather than %20', () => {
    const url = youtubeSearchUrl(makeGlobalLevel({ name: 'Tidal Wave' }))

    expect(url).toContain('+')
    expect(url).not.toContain('%20')
  })

  it('percent-encodes everything else that needs it', () => {
    const url = youtubeSearchUrl(
      makeGlobalLevel({ name: 'A & B', creator: 'C/D' })
    )

    expect(url).toContain('%26')
    expect(url).toContain('%2F')
  })

  it('points at YouTube results', () => {
    expect(youtubeSearchUrl(makeGlobalLevel())).toMatch(
      /^https:\/\/www\.youtube\.com\/results\?search_query=/
    )
  })
})

describe('copiedFromLevelId', () => {
  it('reports the level a copy came from', () => {
    const level = makeGlobalLevel({ inGameId: '200', copiedFromId: '100' })

    expect(copiedFromLevelId(level)).toBe('100')
  })

  it('reports nothing for an original level', () => {
    const level = makeGlobalLevel({ copiedFromId: null })

    expect(copiedFromLevelId(level)).toBeNull()
  })

  // A reupload shares the original's in-game id, so this would otherwise link
  // to the page the user is already looking at.
  it('reports nothing when the copy source is the level itself', () => {
    const level = makeGlobalLevel({ inGameId: '100', copiedFromId: '100' })

    expect(copiedFromLevelId(level)).toBeNull()
  })
})
