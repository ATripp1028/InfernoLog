/**
 * The Log page's vocabulary and grouping.
 *
 * The rules with teeth are the ones a rendered feed would hide. Days group on
 * RECORDED time, so a back-dated completion has to sit under the day it was
 * entered rather than the day it happened. Milestone direction is read off the
 * two positions rather than stored, so entering and leaving the top 10 have to
 * come back differently from the same `10`. And the rating-rank headline
 * inverts: a FALL in the number is a RISE in the ranking.
 */

import { describe, expect, it } from 'vitest'
import { ProgressUpdateKind } from '@infernolog/core'
import type {
  ActivityFeedEvent,
  ActivityFeedItem,
  ActivityFieldChange,
} from '@infernolog/core'
import {
  bulkReplaceSummary,
  editSections,
  editSummary,
  groupByDay,
  milestoneLabel,
  positionLabel,
  progressReach,
  progressVerb,
  ratingRankHeadline,
} from '../feedContent'

function change(
  fieldName: string,
  category: ActivityFieldChange['category'],
  oldValue: string | null,
  newValue: string | null
): ActivityFieldChange {
  return { fieldName, category, oldValue, newValue }
}

function event(overrides: Partial<ActivityFeedEvent> = {}): ActivityFeedEvent {
  return {
    source: 'EVENT',
    id: 'e1',
    recordedAt: new Date('2026-08-25T12:00:00Z'),
    sequence: 1,
    eventType: 'LOG_EDIT',
    levelId: '123',
    levelName: 'Slaughterhouse',
    fieldChanges: [],
    levelImpacts: [],
    impactCount: 0,
    ...overrides,
  }
}

function progress(
  recordedAt: string,
  overrides: Partial<Extract<ActivityFeedItem, { source: 'PROGRESS' }>> = {}
): ActivityFeedItem {
  return {
    source: 'PROGRESS',
    id: `p-${recordedAt}`,
    recordedAt: new Date(recordedAt),
    kind: ProgressUpdateKind.PROGRESS,
    levelId: '123',
    levelName: 'Slaughterhouse',
    date: null,
    dateTimezone: null,
    dateUncertain: false,
    percentage: 42,
    runFrom: null,
    runTo: null,
    attempts: 100,
    enjoyment: null,
    ...overrides,
  }
}

describe('groupByDay', () => {
  const now = new Date('2026-08-25T18:00:00Z')

  it('names the two most recent days rather than dating them', () => {
    const days = groupByDay(
      [
        progress('2026-08-25T10:00:00Z'),
        progress('2026-08-24T10:00:00Z'),
        progress('2026-08-20T10:00:00Z'),
      ],
      'ISO',
      now
    )
    expect(days.map((d) => d.heading)).toEqual([
      'Today',
      'Yesterday',
      '2026-08-20',
    ])
  })

  it('groups on recorded time, not on the date the user entered', () => {
    // A completion written down today about a run from months ago belongs at
    // the top of today — this log records when a thing was written down.
    const days = groupByDay(
      [
        progress('2026-08-25T10:00:00Z', {
          kind: ProgressUpdateKind.COMPLETION,
          date: new Date('2026-01-04T00:00:00Z'),
        }),
      ],
      'ISO',
      now
    )
    expect(days).toHaveLength(1)
    expect(days[0]!.heading).toBe('Today')
  })

  it('keeps one section per run of a day rather than one per row', () => {
    const days = groupByDay(
      [progress('2026-08-25T12:00:00Z'), progress('2026-08-25T09:00:00Z')],
      'ISO',
      now
    )
    expect(days).toHaveLength(1)
    expect(days[0]!.items).toHaveLength(2)
  })
})

describe('progress rows', () => {
  it('reads a completion as 100% whatever the row stores', () => {
    expect(
      progressReach({
        kind: ProgressUpdateKind.COMPLETION,
        percentage: 42,
        runFrom: 10,
        runTo: 90,
      })
    ).toBe('100%')
  })

  it('prefers a run range over a percentage', () => {
    expect(
      progressReach({
        kind: ProgressUpdateKind.PROGRESS,
        percentage: null,
        runFrom: 31,
        runTo: 78,
      })
    ).toBe('31–78%')
  })

  it('defaults the missing side of a run range', () => {
    expect(
      progressReach({
        kind: ProgressUpdateKind.PROGRESS,
        percentage: null,
        runFrom: null,
        runTo: 78,
      })
    ).toBe('0–78%')
  })

  it('colours a completion and a drop but leaves an ordinary run quiet', () => {
    expect(progressVerb(ProgressUpdateKind.COMPLETION)).toEqual({
      verb: 'Beat',
      tone: 'success',
    })
    expect(progressVerb(ProgressUpdateKind.DROP)).toEqual({
      verb: 'Dropped',
      tone: 'danger',
    })
    expect(progressVerb(ProgressUpdateKind.PROGRESS)).toEqual({
      verb: 'Logged',
      tone: 'neutral',
    })
  })
})

describe('milestoneLabel', () => {
  it('tells entering a threshold from leaving it, from the same number', () => {
    expect(milestoneLabel(10, 12, 9)).toBe('Entered the top 10')
    expect(milestoneLabel(10, 9, 12)).toBe('Left the top 10')
  })

  it('treats a placement as entering', () => {
    expect(milestoneLabel(5, null, 3)).toBe('Entered the top 5')
  })

  it('treats leaving the ranking as leaving the threshold', () => {
    expect(milestoneLabel(5, 2, null)).toBe('Left the top 5')
  })

  it('says nothing when nothing was crossed', () => {
    expect(milestoneLabel(null, 30, 28)).toBeNull()
  })
})

describe('positionLabel', () => {
  it('reads an absent position as unranked rather than as #null', () => {
    expect(positionLabel(null)).toBe('unranked')
    expect(positionLabel(4)).toBe('#4')
  })
})

describe('ratingRankHeadline', () => {
  it('reads a fall in the number as a rise in the ranking', () => {
    // Lower is better: #61 → #18 is 43 places UP.
    expect(
      ratingRankHeadline(
        event({ fieldChanges: [change('rating_rank', 'RATING', '61', '18')] })
      )
    ).toBe('Up 43 in your ranking')
  })

  it('reads a rise in the number as a fall', () => {
    expect(
      ratingRankHeadline(
        event({ fieldChanges: [change('rating_rank', 'RATING', '4', '9')] })
      )
    ).toBe('Down 5 in your ranking')
  })

  it('announces a level that had no rating position before', () => {
    expect(
      ratingRankHeadline(
        event({ fieldChanges: [change('rating_rank', 'RATING', null, '7')] })
      )
    ).toBe('New at #7 in your ranking')
  })

  it('says nothing when the save carried no rank row', () => {
    expect(
      ratingRankHeadline(
        event({ fieldChanges: [change('notes', 'SESSION_DETAIL', null, 'x')] })
      )
    ).toBeNull()
  })
})

describe('editSections', () => {
  it('sets the two derived figures apart from the fields the user typed', () => {
    // weighted_average and rating_rank are tagged RATING like everything else,
    // but they describe the CONSEQUENCE of the save rather than part of it.
    const { sections, derived } = editSections(
      event({
        fieldChanges: [
          change('simple_rating', 'RATING', '70', '80'),
          change('weighted_average', 'RATING', '7.84', '8.31'),
          change('rating_rank', 'RATING', '61', '18'),
          change('notes', 'SESSION_DETAIL', null, 'finally'),
        ],
      })
    )
    expect(derived.map((d) => d.fieldName)).toEqual([
      'weighted_average',
      'rating_rank',
    ])
    expect(sections.map((s) => s.heading)).toEqual([
      'Rating',
      'Session details',
    ])
    expect(sections[0]!.rows.map((r) => r.fieldName)).toEqual(['simple_rating'])
  })

  it('counts only the fields the user changed in its summary', () => {
    expect(
      editSummary(
        event({
          fieldChanges: [
            change('simple_rating', 'RATING', '70', '80'),
            change('weighted_average', 'RATING', '7.84', '8.31'),
            change('rating_rank', 'RATING', '61', '18'),
          ],
        })
      )
    ).toBe('1 field changed — rating')
  })
})

describe('bulkReplaceSummary', () => {
  const impact = (positionAfter: number | null) => ({
    levelId: '1',
    levelName: 'x',
    role: 'MOVER' as const,
    positionBefore: 1,
    positionAfter,
    milestoneCrossed: null,
  })

  it('reports the drop-outs when the preview holds the whole event', () => {
    expect(
      bulkReplaceSummary(
        event({
          eventType: 'DEMON_LIST_BULK_REPLACE',
          levelImpacts: [impact(1), impact(2), impact(null)],
          impactCount: 3,
        })
      )
    ).toBe('3 levels reordered — 1 dropped out')
  })

  it('states only the total when the preview is capped', () => {
    // The drop-out count is only countable from the rows actually returned, so
    // a capped preview must not quote a number it cannot know.
    expect(
      bulkReplaceSummary(
        event({
          eventType: 'DEMON_LIST_BULK_REPLACE',
          levelImpacts: [impact(1), impact(null)],
          impactCount: 42,
        })
      )
    ).toBe('42 levels reordered')
  })
})
