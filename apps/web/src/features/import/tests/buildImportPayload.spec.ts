import { describe, expect, it } from 'vitest'
import type { GroupResolution } from '../FieldConflictMerge'
import { buildImportPayload } from '../buildImportPayload'
import { RANKING_MERGE_KEY } from '../importWizardModel'
import {
  completionRow,
  droppedRow,
  flag,
  listRow,
  parseResult,
  progressRow,
  rankingRow,
  ratingRow,
  rowConflict,
} from './fixtures'

const noResolutions = () => ({
  completion: new Map<string, GroupResolution>(),
  progress: new Map<string, GroupResolution>(),
  dropped: new Map<string, GroupResolution>(),
  rating: new Map<string, GroupResolution>(),
})

const build = (input: Partial<Parameters<typeof buildImportPayload>[0]> = {}) =>
  buildImportPayload({
    completions: [],
    progressRows: [],
    dropped: [],
    resolutions: noResolutions(),
    listOrders: new Map(),
    progressConflictsForCommit: [],
    droppedConflictsForCommit: [],
    parseResult: parseResult(),
    ...input,
  })

const rowsOfType = (
  payload: ReturnType<typeof buildImportPayload>,
  type: string
) => payload.rows.filter((r) => r.type === type)

describe('buildImportPayload', () => {
  describe('the flat row list', () => {
    it('tags each row with the tab it came from', () => {
      const payload = build({
        completions: [completionRow()],
        dropped: [droppedRow()],
        progressRows: [progressRow()],
      })

      expect(payload.rows.map((r) => r.type)).toEqual([
        'completion',
        'dropped',
        'progress',
      ])
    })

    // The three tabs each index from 0, so they are offset into disjoint
    // ranges — without this, a dropped row and a completion row would collide
    // on rowIndex and the worker could not report outcomes per row.
    it('offsets the three tabs into non-overlapping index ranges', () => {
      const payload = build({
        completions: [completionRow({ rowIndex: 0 })],
        dropped: [droppedRow({ rowIndex: 0 })],
        progressRows: [progressRow({ rowIndex: 0 })],
      })

      expect(payload.rows.map((r) => r.rowIndex)).toEqual([0, 100000, 200000])
    })

    it('keeps indices unique across a whole workbook', () => {
      const many = (n: number) => Array.from({ length: n }, (_, i) => i)
      const payload = build({
        completions: many(50).map((i) => completionRow({ rowIndex: i })),
        dropped: many(50).map((i) => droppedRow({ rowIndex: i })),
        progressRows: many(50).map((i) => progressRow({ rowIndex: i })),
      })

      expect(new Set(payload.rows.map((r) => r.rowIndex)).size).toBe(150)
    })

    it('sends an unresolved row with no resolution tag', () => {
      const payload = build({ completions: [completionRow()] })

      expect(payload.rows[0]).not.toHaveProperty('resolution')
    })
  })

  describe('applying conflict resolutions', () => {
    it('tags a resolved completion with its resolution', () => {
      const resolutions = noResolutions()
      resolutions.completion.set('0', { resolution: 'overwrite', values: {} })

      const payload = build({
        completions: [completionRow({ rowIndex: 0 })],
        resolutions,
      })

      expect(payload.rows[0]).toMatchObject({ resolution: 'overwrite' })
    })

    // `values` only carries fields whose winner was NOT the imported one, so
    // it is layered over the parsed data rather than replacing it.
    it('overlays only the fields the user overrode', () => {
      const resolutions = noResolutions()
      resolutions.completion.set('0', {
        resolution: 'merge',
        values: { attempts: 999 },
      })

      const payload = build({
        completions: [
          completionRow({
            rowIndex: 0,
            data: { levelId: '128', attempts: 10, percentage: 50 },
          }),
        ],
        resolutions,
      })

      expect(payload.rows[0]!.data).toEqual({
        levelId: '128',
        attempts: 999,
        percentage: 50,
      })
    })

    // Resolutions are keyed by row index, not level id — a sheet may log the
    // same level twice and only one of those rows conflicted.
    it('applies a resolution to only the row it was keyed to', () => {
      const resolutions = noResolutions()
      resolutions.completion.set('1', { resolution: 'drop', values: {} })

      const payload = build({
        completions: [
          completionRow({ rowIndex: 0, data: { levelId: '128' } }),
          completionRow({ rowIndex: 1, data: { levelId: '128' } }),
        ],
        resolutions,
      })

      expect(payload.rows[0]).not.toHaveProperty('resolution')
      expect(payload.rows[1]).toMatchObject({ resolution: 'drop' })
    })

    // Resolving a progress/dropped conflict has to fold the matched entry's
    // id back onto the row, so the server takes its ordinary id round-trip
    // path rather than the derived-key fallback.
    it('folds the matched entry id back onto a resolved progress row', () => {
      const resolutions = noResolutions()
      resolutions.progress.set('0', { resolution: 'overwrite', values: {} })

      const payload = build({
        progressRows: [progressRow({ rowIndex: 0 })],
        resolutions,
        progressConflictsForCommit: [
          rowConflict({ rowIndex: 0, matchedId: 'progress-uuid' }),
        ],
      })

      expect(rowsOfType(payload, 'progress')[0]!.data).toMatchObject({
        progressId: 'progress-uuid',
      })
    })

    it('folds the matched entry id back onto a resolved dropped row', () => {
      const resolutions = noResolutions()
      resolutions.dropped.set('0', { resolution: 'overwrite', values: {} })

      const payload = build({
        dropped: [droppedRow({ rowIndex: 0 })],
        resolutions,
        droppedConflictsForCommit: [
          rowConflict({ rowIndex: 0, matchedId: 'drop-uuid' }),
        ],
      })

      expect(rowsOfType(payload, 'dropped')[0]!.data).toMatchObject({
        dropId: 'drop-uuid',
      })
    })

    it('adds no id when the conflict matched nothing', () => {
      const resolutions = noResolutions()
      resolutions.progress.set('0', { resolution: 'overwrite', values: {} })

      const payload = build({
        progressRows: [progressRow({ rowIndex: 0 })],
        resolutions,
        progressConflictsForCommit: [
          rowConflict({ rowIndex: 0, matchedId: null }),
        ],
      })

      expect(rowsOfType(payload, 'progress')[0]!.data).not.toHaveProperty(
        'progressId'
      )
    })

    // The matched id rides along with the resolution; an unresolved row keeps
    // whatever identity the sheet gave it.
    it('adds no id to an unresolved progress row', () => {
      const payload = build({
        progressRows: [progressRow({ rowIndex: 0 })],
        progressConflictsForCommit: [
          rowConflict({ rowIndex: 0, matchedId: 'progress-uuid' }),
        ],
      })

      expect(rowsOfType(payload, 'progress')[0]!.data).not.toHaveProperty(
        'progressId'
      )
    })
  })

  describe('ranking', () => {
    it('sends the sheet rows when no merge was needed', () => {
      const payload = build({
        parseResult: parseResult({
          ranking: [
            rankingRow({ levelId: '1', levelName: 'A' }),
            rankingRow({ levelId: '2', levelName: 'B' }),
          ],
        }),
      })

      expect(payload.ranking).toEqual([
        { levelId: '1', levelName: 'A' },
        { levelId: '2', levelName: 'B' },
      ])
    })

    // A resolved order is the user's final say, so it replaces the sheet's
    // rows outright rather than merging with them again.
    it('lets a resolved merge order win outright', () => {
      const payload = build({
        parseResult: parseResult({
          ranking: [rankingRow({ levelId: '1' }), rankingRow({ levelId: '2' })],
        }),
        listOrders: new Map([[RANKING_MERGE_KEY, ['9', '8', '7']]]),
      })

      expect(payload.ranking).toEqual([
        { levelId: '9', levelName: null },
        { levelId: '8', levelName: null },
        { levelId: '7', levelName: null },
      ])
    })

    it('drops unparseable and unidentifiable rows from the fallback', () => {
      const payload = build({
        parseResult: parseResult({
          ranking: [
            rankingRow({ levelId: '1' }),
            rankingRow({ flags: [flag({ severity: 'error' })] }),
            rankingRow({ levelId: null, levelName: null }),
          ],
        }),
      })

      expect(payload.ranking).toHaveLength(1)
    })

    // Omitted rather than sent empty, so the server can tell "no ranking in
    // this import" from "an intentionally empty ranking".
    it('omits the section entirely when there is nothing to send', () => {
      expect(build()).not.toHaveProperty('ranking')
    })
  })

  describe('collections', () => {
    it('sends untouched sheet rows as they were parsed', () => {
      const payload = build({
        parseResult: parseResult({
          lists: [
            listRow({
              list: 'Favorites',
              levelId: '1',
              levelName: 'Level 1',
              position: 0,
            }),
          ],
        }),
      })

      expect(payload.collections).toEqual([
        {
          list: 'Favorites',
          levelId: '1',
          levelName: 'Level 1',
          creator: null,
          inGameDifficulty: null,
          position: 0,
        },
      ])
    })

    it('replaces a merged collection with the resolved order, positioned in sequence', () => {
      const payload = build({
        parseResult: parseResult({
          lists: [listRow({ list: 'Favorites', levelId: '1' })],
        }),
        listOrders: new Map([['Favorites', ['3', '2', '1']]]),
      })

      expect(payload.collections).toEqual([
        {
          list: 'Favorites',
          levelId: '3',
          levelName: null,
          creator: null,
          inGameDifficulty: null,
          position: 0,
        },
        {
          list: 'Favorites',
          levelId: '2',
          levelName: null,
          creator: null,
          inGameDifficulty: null,
          position: 1,
        },
        {
          list: 'Favorites',
          levelId: '1',
          levelName: null,
          creator: null,
          inGameDifficulty: null,
          position: 2,
        },
      ])
    })

    // A sheet can touch several collections while only some needed merging;
    // the unmerged ones must survive untouched alongside the resolved order.
    it('keeps unmerged collections while replacing the merged one', () => {
      const payload = build({
        parseResult: parseResult({
          lists: [
            listRow({ list: 'Favorites', levelId: '1' }),
            listRow({ list: 'Extreme Demons', levelId: '2' }),
          ],
        }),
        listOrders: new Map([['Favorites', ['5']]]),
      })

      const byList = (name: string) =>
        payload.collections!.filter((c) => c.list === name)

      expect(byList('Extreme Demons').map((c) => c.levelId)).toEqual(['2'])
      expect(byList('Favorites').map((c) => c.levelId)).toEqual(['5'])
    })

    // The resolved order is keyed by the CLASSIFIED name, while sheet rows
    // carry whatever the user typed — matching raw would let a "want_to_beat"
    // row survive alongside the resolved "Want to Beat" order and double it.
    it('matches a resolved built-in against the sheet spelling of its name', () => {
      const payload = build({
        parseResult: parseResult({
          lists: [listRow({ list: 'want_to_beat', levelId: '1' })],
        }),
        listOrders: new Map([['Want to Beat', ['5']]]),
      })

      expect(payload.collections!.map((c) => c.levelId)).toEqual(['5'])
    })

    it('does not treat the ranking sentinel as a collection', () => {
      const payload = build({
        listOrders: new Map([[RANKING_MERGE_KEY, ['1']]]),
      })

      expect(payload).not.toHaveProperty('collections')
    })

    it('drops unparseable, nameless, and unidentifiable rows', () => {
      const payload = build({
        parseResult: parseResult({
          lists: [
            listRow({ flags: [flag({ severity: 'error' })] }),
            listRow({ list: null }),
            listRow({ levelId: null, levelName: null }),
          ],
        }),
      })

      expect(payload).not.toHaveProperty('collections')
    })

    it('omits the section entirely when there is nothing to send', () => {
      expect(build()).not.toHaveProperty('collections')
    })
  })

  describe('ratings', () => {
    it('sends valid rows with their scores', () => {
      const payload = build({
        parseResult: parseResult({
          ratings: [ratingRow({ levelId: '128', scores: { Gameplay: 80 } })],
        }),
      })

      expect(payload.ratings).toEqual([
        {
          levelId: '128',
          levelName: 'Level 128',
          creator: null,
          inGameDifficulty: null,
          scores: { Gameplay: 80 },
        },
      ])
    })

    it('replaces a category score the user resolved to a number', () => {
      const resolutions = noResolutions()
      resolutions.rating.set('128::Gameplay', {
        resolution: 'merge',
        values: { score: 55 },
      })

      const payload = build({
        parseResult: parseResult({
          ratings: [
            ratingRow({
              levelId: '128',
              scores: { Gameplay: 80, Design: 60 },
            }),
          ],
        }),
        resolutions,
      })

      expect(payload.ratings![0]!.scores).toEqual({ Gameplay: 55, Design: 60 })
    })

    // 'drop' means "keep what InfernoLog already has for this category", so
    // the category is removed from the payload rather than sent as anything.
    it('removes a dropped category, leaving the stored value untouched', () => {
      const resolutions = noResolutions()
      resolutions.rating.set('128::Gameplay', {
        resolution: 'drop',
        values: {},
      })

      const payload = build({
        parseResult: parseResult({
          ratings: [
            ratingRow({ levelId: '128', scores: { Gameplay: 80, Design: 60 } }),
          ],
        }),
        resolutions,
      })

      expect(payload.ratings![0]!.scores).toEqual({ Design: 60 })
    })

    it('drops a row whose every category was resolved away', () => {
      const resolutions = noResolutions()
      resolutions.rating.set('128::Gameplay', {
        resolution: 'drop',
        values: {},
      })

      const payload = build({
        parseResult: parseResult({
          ratings: [ratingRow({ levelId: '128', scores: { Gameplay: 80 } })],
        }),
        resolutions,
      })

      expect(payload).not.toHaveProperty('ratings')
    })

    it('leaves unresolved categories exactly as parsed', () => {
      const resolutions = noResolutions()
      resolutions.rating.set('999::Gameplay', {
        resolution: 'drop',
        values: {},
      })

      const payload = build({
        parseResult: parseResult({
          ratings: [ratingRow({ levelId: '128', scores: { Gameplay: 80 } })],
        }),
        resolutions,
      })

      expect(payload.ratings![0]!.scores).toEqual({ Gameplay: 80 })
    })

    // Resolutions are keyed by levelId, so a name-only row can never match
    // one — it must pass through rather than be silently emptied.
    it('passes a name-only row through untouched', () => {
      const resolutions = noResolutions()
      resolutions.rating.set('128::Gameplay', {
        resolution: 'drop',
        values: {},
      })

      const payload = build({
        parseResult: parseResult({
          ratings: [
            ratingRow({
              levelId: null,
              levelName: 'Bloodbath',
              scores: { Gameplay: 80 },
            }),
          ],
        }),
        resolutions,
      })

      expect(payload.ratings![0]!.scores).toEqual({ Gameplay: 80 })
    })

    it('applies the shared validity filter', () => {
      const payload = build({
        parseResult: parseResult({
          ratings: [
            ratingRow({ scores: {} }),
            ratingRow({ flags: [flag({ severity: 'error' })] }),
            ratingRow({ levelId: null, levelName: null }),
          ],
        }),
      })

      expect(payload).not.toHaveProperty('ratings')
    })
  })

  it('sends only the rows list for a workbook with nothing but completions', () => {
    const payload = build({ completions: [completionRow()] })

    expect(Object.keys(payload)).toEqual(['rows'])
  })

  it('handles a fully empty workbook without throwing', () => {
    const payload = build({ parseResult: null })

    expect(payload).toEqual({ rows: [] })
  })
})
