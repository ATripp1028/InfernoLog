import { describe, expect, it } from 'vitest'
import { buildCheckRequest } from '../buildCheckRequest'
import {
  completionRow,
  droppedRow,
  flag,
  listRow,
  parseResult,
  progressRow,
  rankingRow,
  ratingRow,
} from './fixtures'

const build = (input: Partial<Parameters<typeof buildCheckRequest>[0]> = {}) =>
  buildCheckRequest({
    parseResult: parseResult(),
    completions: [],
    progressRows: [],
    dropped: [],
    ...input,
  })

describe('buildCheckRequest', () => {
  describe('row tabs', () => {
    // The three row tabs are passed in already filtered by the caller, so they
    // are forwarded as-is — only the index and data survive the mapping.
    it.each([
      ['completions', 'completions'],
      ['progressRows', 'progress'],
      ['dropped', 'dropped'],
    ] as const)('forwards %s as %s', (inputKey, requestKey) => {
      const row = { rowIndex: 4, data: { levelId: '128' }, flags: [] }
      const { request } = build({ [inputKey]: [row] })

      expect(request[requestKey]).toEqual([{ rowIndex: 4, data: row.data }])
    })

    it('keeps row indices intact so the check can be matched back', () => {
      const { request } = build({
        completions: [
          completionRow({ rowIndex: 0 }),
          completionRow({ rowIndex: 9 }),
        ],
      })

      expect(request.completions.map((r) => r.rowIndex)).toEqual([0, 9])
    })
  })

  describe('ranking rows', () => {
    it('sends the level identity for each row', () => {
      const { request } = build({
        parseResult: parseResult({
          ranking: [rankingRow({ levelId: '128', levelName: 'Bloodbath' })],
        }),
      })

      expect(request.ranking).toEqual([
        { levelId: '128', levelName: 'Bloodbath' },
      ])
    })

    it('drops a row that failed to parse', () => {
      const { request } = build({
        parseResult: parseResult({
          ranking: [rankingRow({ flags: [flag({ severity: 'error' })] })],
        }),
      })

      expect(request.ranking).toEqual([])
    })

    it('keeps a row whose only flag is a warning', () => {
      const { request } = build({
        parseResult: parseResult({
          ranking: [rankingRow({ flags: [flag({ severity: 'warning' })] })],
        }),
      })

      expect(request.ranking).toHaveLength(1)
    })

    it('drops a row that identifies no level', () => {
      const { request } = build({
        parseResult: parseResult({
          ranking: [rankingRow({ levelId: null, levelName: null })],
        }),
      })

      expect(request.ranking).toEqual([])
    })

    it('keeps a name-only row for server-side resolution', () => {
      const { request } = build({
        parseResult: parseResult({
          ranking: [rankingRow({ levelId: null, levelName: 'Bloodbath' })],
        }),
      })

      expect(request.ranking).toHaveLength(1)
    })
  })

  describe('collection rows', () => {
    it('sends the full identity plus the position', () => {
      const { request } = build({
        parseResult: parseResult({
          lists: [
            listRow({
              list: 'Favorites',
              levelId: '128',
              levelName: 'Bloodbath',
              creator: 'Riot',
              inGameDifficulty: 'EXTREME_DEMON',
              position: 3,
            }),
          ],
        }),
      })

      expect(request.collections).toEqual([
        {
          list: 'Favorites',
          levelId: '128',
          levelName: 'Bloodbath',
          creator: 'Riot',
          inGameDifficulty: 'EXTREME_DEMON',
          position: 3,
        },
      ])
    })

    // A list row with no collection name has nothing to merge into — unlike
    // the other tabs, the list name is required on top of a level identity.
    it('drops a row with no collection name', () => {
      const { request } = build({
        parseResult: parseResult({ lists: [listRow({ list: null })] }),
      })

      expect(request.collections).toEqual([])
    })

    it('drops a row that failed to parse or identifies no level', () => {
      const { request } = build({
        parseResult: parseResult({
          lists: [
            listRow({ flags: [flag({ severity: 'error' })] }),
            listRow({ levelId: null, levelName: null }),
          ],
        }),
      })

      expect(request.collections).toEqual([])
    })
  })

  describe('rating rows', () => {
    it('sends the identity and the score map', () => {
      const { request } = build({
        parseResult: parseResult({
          ratings: [
            ratingRow({ levelId: '128', scores: { Gameplay: 80, Design: 60 } }),
          ],
        }),
      })

      expect(request.ratings).toEqual([
        {
          levelId: '128',
          levelName: 'Level 128',
          creator: null,
          inGameDifficulty: null,
          scores: { Gameplay: 80, Design: 60 },
        },
      ])
    })

    // Shares getValidRatingRows with the commit payload, so the two passes
    // never disagree about which rows are importable.
    it('applies the same validity filter the commit uses', () => {
      const { request } = build({
        parseResult: parseResult({
          ratings: [
            ratingRow({ scores: {} }),
            ratingRow({ levelId: null, levelName: null }),
            ratingRow({ flags: [flag({ severity: 'error' })] }),
            ratingRow({ levelId: '999' }),
          ],
        }),
      })

      expect(request.ratings).toHaveLength(1)
      expect(request.ratings[0]!.levelId).toBe('999')
    })
  })

  // The round trip is skipped entirely when the sheet produced nothing —
  // the caller falls back to EMPTY_CHECK_RESULT rather than calling /check.
  describe('whether the check is worth making', () => {
    it('reports no rows for an empty workbook', () => {
      expect(build().hasRows).toBe(false)
    })

    it.each([
      ['a completion', { completions: [completionRow()] }],
      ['a progress row', { progressRows: [progressRow()] }],
      ['a dropped row', { dropped: [droppedRow()] }],
      ['a rating', { parseResult: parseResult({ ratings: [ratingRow()] }) }],
      [
        'a ranking row',
        { parseResult: parseResult({ ranking: [rankingRow()] }) },
      ],
      ['a list row', { parseResult: parseResult({ lists: [listRow()] }) }],
    ])('reports rows when the sheet has %s', (_label, input) => {
      expect(build(input).hasRows).toBe(true)
    })

    // The flag counts rows that survived filtering, not rows the sheet had —
    // a workbook of nothing but broken rows must not trigger a pointless call.
    it('reports no rows when every parsed row was filtered out', () => {
      const { hasRows } = build({
        parseResult: parseResult({
          ranking: [rankingRow({ flags: [flag({ severity: 'error' })] })],
          lists: [listRow({ list: null })],
          ratings: [ratingRow({ scores: {} })],
        }),
      })

      expect(hasRows).toBe(false)
    })
  })
})
