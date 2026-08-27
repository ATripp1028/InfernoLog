/**
 * The rank-history panel's wording and series.
 *
 * The rule with teeth is that lower is better — #3 is above #8 — so every
 * "moved up" decision inverts against the numbers, and a mistake reads as a
 * plausible sentence rather than as an obvious bug.
 *
 * The other is that an UNATTRIBUTED shift must never name a level. It exists
 * precisely because the entry that caused it was deleted and took its events
 * with it; the shift is a fact, the cause is not recoverable.
 */

import { describe, expect, it } from 'vitest'
import type { RankHistoryEntry } from '@infernolog/core'
import {
  entryLabel,
  milestoneText,
  positionText,
  rankSeries,
  rankStats,
} from '../rankHistoryContent'

function entry(overrides: Partial<RankHistoryEntry> = {}): RankHistoryEntry {
  return {
    id: 'e1',
    recordedAt: new Date('2026-08-25T12:00:00Z'),
    kind: 'DIRECT',
    eventType: 'DEMON_LIST_REORDER',
    positionBefore: 8,
    positionAfter: 3,
    milestoneCrossed: null,
    cause: null,
    neighbors: [],
    levelsTouched: null,
    ...overrides,
  }
}

describe('entryLabel', () => {
  it('reads a falling number as moving up', () => {
    expect(entryLabel(entry({ positionBefore: 8, positionAfter: 3 }))).toBe(
      'Moved up'
    )
    expect(entryLabel(entry({ positionBefore: 3, positionAfter: 8 }))).toBe(
      'Moved down'
    )
  })

  it('names the level that caused an indirect shift', () => {
    expect(
      entryLabel(
        entry({
          kind: 'INDIRECT',
          eventType: 'DEMON_LIST_PLACEMENT',
          positionBefore: 3,
          positionAfter: 4,
          cause: { levelId: '9', levelName: 'Avernus' },
        })
      )
    ).toBe('Avernus placed above')
  })

  it('says a level LEFT from above when its removal moved this one up', () => {
    expect(
      entryLabel(
        entry({
          kind: 'INDIRECT',
          eventType: 'DEMON_LIST_REMOVED',
          positionBefore: 9,
          positionAfter: 8,
          cause: { levelId: '9', levelName: 'Bloodbath' },
        })
      )
    ).toBe('Bloodbath left from above')
  })

  it('never names a level on an unattributed shift', () => {
    const label = entryLabel(
      entry({
        kind: 'UNATTRIBUTED',
        eventType: null,
        positionBefore: 3,
        positionAfter: 2,
      })
    )
    expect(label).toBe('1 level removed from above')
  })

  it('counts the levels when an unattributed shift spans several', () => {
    expect(
      entryLabel(
        entry({
          kind: 'UNATTRIBUTED',
          eventType: null,
          positionBefore: 4,
          positionAfter: 7,
        })
      )
    ).toBe('3 levels placed above')
  })

  it('describes an import rather than a single mover', () => {
    // Every row on a bulk replace is a mover, so no one level is the cause.
    expect(
      entryLabel(
        entry({
          kind: 'INDIRECT',
          eventType: 'DEMON_LIST_BULK_REPLACE',
          cause: null,
        })
      )
    ).toBe('A spreadsheet import reordered your demon list')
  })
})

describe('positionText', () => {
  it('distinguishes not-yet-ranked from no-longer-ranked', () => {
    expect(positionText(null, 'before')).toBe('new')
    expect(positionText(null, 'after')).toBe('out')
    expect(positionText(4, 'after')).toBe('#4')
  })
})

describe('milestoneText', () => {
  it('reads direction off the positions rather than off the threshold', () => {
    expect(
      milestoneText(
        entry({ milestoneCrossed: 10, positionBefore: 13, positionAfter: 8 })
      )
    ).toBe('Entered the top 10')
    expect(
      milestoneText(
        entry({ milestoneCrossed: 10, positionBefore: 8, positionAfter: 13 })
      )
    ).toBe('Left the top 10')
  })

  it('says nothing when no threshold was crossed', () => {
    expect(milestoneText(entry({ milestoneCrossed: null }))).toBeNull()
  })
})

describe('rankStats', () => {
  it('reports the best position the history can actually see', () => {
    const stats = rankStats(
      [
        entry({ id: 'a', positionBefore: 3, positionAfter: 5 }),
        entry({ id: 'b', positionBefore: 8, positionAfter: 3 }),
      ],
      5
    )
    expect(stats.peak?.position).toBe(3)
    expect(stats.current).toBe(5)
  })

  it('counts only the moves the user made themselves', () => {
    const stats = rankStats(
      [
        entry({ id: 'a' }),
        entry({ id: 'b', kind: 'INDIRECT' }),
        entry({ id: 'c', kind: 'UNATTRIBUTED', eventType: null }),
      ],
      3
    )
    expect(stats.moveCount).toBe(1)
  })
})

describe('rankSeries', () => {
  const now = new Date('2026-08-26T00:00:00Z')

  it('starts where the level started, not where the first event left it', () => {
    const points = rankSeries(
      [
        entry({
          id: 'a',
          recordedAt: new Date('2026-08-25T12:00:00Z'),
          positionBefore: 8,
          positionAfter: 3,
        }),
      ],
      3,
      now
    )
    expect(points.map((p) => p.position)).toEqual([8, 3, 3])
  })

  it('runs the line to the present rather than to the last event', () => {
    const points = rankSeries(
      [entry({ recordedAt: new Date('2026-08-20T12:00:00Z') })],
      3,
      now
    )
    expect(points[points.length - 1]).toEqual({
      time: now.getTime(),
      position: 3,
    })
  })

  it('breaks the line where the level left the ranking', () => {
    const points = rankSeries(
      [
        entry({
          id: 'a',
          eventType: 'DEMON_LIST_REMOVED',
          positionBefore: 4,
          positionAfter: null,
        }),
      ],
      null,
      now
    )
    expect(points.map((p) => p.position)).toEqual([4, null])
  })
})
