import { describe, expect, it } from 'vitest'
import { CollectionType } from '@infernolog/core'
import { makeCollectionDetail, makeEntry, makeLevel } from '@/utils/testUtils'
import { copyResultMessage, newLevelCount } from '../copyPreview'

/** A collection of `type` holding these level ids; `true` marks one beaten. */
function collection(
  type: CollectionType,
  levels: Array<[id: string, completed?: boolean]>
) {
  return makeCollectionDetail({
    type,
    entries: levels.map(([id, completed = false]) =>
      makeEntry({
        id: `entry-${id}`,
        completed,
        level: makeLevel({ inGameId: id }),
      })
    ),
  })
}

describe('newLevelCount', () => {
  it('counts only the levels the target lacks', () => {
    const source = collection(CollectionType.CUSTOM, [['1'], ['2'], ['3']])
    const target = collection(CollectionType.CUSTOM, [['2'], ['9']])

    expect(newLevelCount(source, target)).toBe(2)
  })

  it('is zero when the target already holds everything', () => {
    const source = collection(CollectionType.CUSTOM, [['1']])
    const target = collection(CollectionType.CUSTOM, [['1'], ['2']])

    expect(newLevelCount(source, target)).toBe(0)
  })

  // Mirrors the server: Want to Beat never takes a beaten level.
  it('leaves out beaten levels when the target is Want to Beat', () => {
    const source = collection(CollectionType.FAVORITES, [['1', true], ['2']])
    const target = collection(CollectionType.WANT_TO_BEAT, [])

    expect(newLevelCount(source, target)).toBe(1)
  })

  it('counts beaten levels for any other target', () => {
    const source = collection(CollectionType.WANT_TO_BEAT, [['1', true], ['2']])
    const target = collection(CollectionType.FAVORITES, [])

    expect(newLevelCount(source, target)).toBe(2)
  })
})

describe('copyResultMessage', () => {
  it.each([
    [{ added: 2, skippedCompleted: 0 }, 'Added 2 levels to Target'],
    [{ added: 1, skippedCompleted: 0 }, 'Added 1 level to Target'],
    [{ added: 0, skippedCompleted: 0 }, 'Nothing new to add to Target'],
    [
      { added: 1, skippedCompleted: 2 },
      "Added 1 level to Target · skipped 2 levels you've beaten",
    ],
  ])('reads %o as "%s"', (result, message) => {
    expect(copyResultMessage(result, 'Target')).toBe(message)
  })
})
