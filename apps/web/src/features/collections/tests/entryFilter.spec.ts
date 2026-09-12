import { describe, expect, it } from 'vitest'
import { makeEntry, makeLevel } from '@/utils/testUtils'
import { entryMatches } from '../entryFilter'

const entry = makeEntry({
  level: makeLevel({
    inGameId: '4284013',
    name: 'Tidal Wave',
    creator: 'OniLink',
  }),
})

describe('entryMatches', () => {
  it.each([
    ['its name', 'tidal'],
    ['its creator', 'onilink'],
    ['its level ID', '42840'],
    ['any casing', 'TIDAL WAVE'],
    ['surrounding spaces', '  wave  '],
  ])('matches by %s', (_label, query) => {
    expect(entryMatches(entry, query)).toBe(true)
  })

  it('keeps everything for a blank query', () => {
    expect(entryMatches(entry, '   ')).toBe(true)
  })

  it('rejects a query nothing contains', () => {
    expect(entryMatches(entry, 'bloodbath')).toBe(false)
  })

  it('copes with a level that has no name or creator yet', () => {
    const bare = makeEntry({
      level: makeLevel({ inGameId: '1', name: null, creator: null }),
    })

    expect(entryMatches(bare, 'x')).toBe(false)
  })
})
