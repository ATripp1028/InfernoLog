/**
 * Unit tests for what a LOG_EDIT records.
 *
 * Two rules carry the weight. The scope is a closed list: a field absent from
 * LOG_EDIT_FIELD_SCOPE — the privacy toggle, the video URLs — must produce no
 * row at all, however the save arrives. And the diff runs on serialized values,
 * so a percentage stored as Decimal(85.00) and one re-sent as 85 are the same
 * value, not an edit.
 */

import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  buildFieldChanges,
  buildRatingScoreChanges,
  LOG_EDIT_FIELD_SCOPE,
  ratingScoreFieldName,
  serializeFieldValue,
} from './fieldScope'

describe('serializeFieldValue', () => {
  it('renders null and undefined alike as no value', () => {
    expect(serializeFieldValue(null)).toBeNull()
    expect(serializeFieldValue(undefined)).toBeNull()
  })

  it('renders a Date as an ISO string', () => {
    expect(serializeFieldValue(new Date('2026-08-24T00:00:00.000Z'))).toBe(
      '2026-08-24T00:00:00.000Z'
    )
  })

  it('renders a Decimal through its numeric value', () => {
    // Otherwise Decimal("85.00") and the number 85 read as different values
    // and every re-save of an unchanged percentage logs a phantom edit.
    expect(serializeFieldValue(new Prisma.Decimal('85.00'))).toBe(
      serializeFieldValue(85)
    )
  })

  it('renders booleans and enums as their plain text', () => {
    expect(serializeFieldValue(false)).toBe('false')
    expect(serializeFieldValue('EXTREME')).toBe('EXTREME')
  })
})

describe('buildFieldChanges', () => {
  it('records a field whose value actually moved', () => {
    const changes = buildFieldChanges({ attempts: 100 }, { attempts: 250 })

    expect(changes).toEqual([
      {
        fieldName: 'attempts',
        category: 'SESSION_DETAIL',
        oldValue: '100',
        newValue: '250',
      },
    ])
  })

  it('ignores a field rewritten with the value it already had', () => {
    expect(buildFieldChanges({ notes: 'gg' }, { notes: 'gg' })).toEqual([])
  })

  it('records clearing a field, and distinguishes it from never having one', () => {
    const cleared = buildFieldChanges({ notes: 'gg' }, { notes: null })
    expect(cleared[0]).toMatchObject({ oldValue: 'gg', newValue: null })

    expect(buildFieldChanges({ notes: null }, { notes: null })).toEqual([])
  })

  it('ignores fields outside the scope however they arrive', () => {
    // Privacy and media are edited on the same form and are deliberately not
    // part of the story a feed tells.
    const changes = buildFieldChanges(
      { visibility: 'PUBLIC', videoUrl: null, highlightUrl: null },
      {
        visibility: 'PRIVATE',
        videoUrl: 'https://youtu.be/x',
        highlightUrl: 'https://youtu.be/y',
      }
    )

    expect(changes).toEqual([])
  })

  it('catches the derived clears applyEdit writes without being asked to', () => {
    // Setting percentage clears runFrom/runTo. The client never sent those, but
    // the entry really did change — which is why the diff runs on the update
    // payload rather than on the request body.
    const changes = buildFieldChanges(
      { percentage: null, runFrom: 44, runTo: 87 },
      { percentage: 92, runFrom: null, runTo: null }
    )

    expect(changes.map((c) => c.fieldName).sort()).toEqual([
      'percentage',
      'run_from',
      'run_to',
    ])
  })

  it('tags every in-scope field with a category, since filters key off it', () => {
    for (const [key, entry] of Object.entries(LOG_EDIT_FIELD_SCOPE)) {
      expect(entry.category, key).toBeTruthy()
      // RATING_CONFIG belongs to rating-config events, never to a log edit.
      expect(entry.category, key).not.toBe('RATING_CONFIG')
    }
  })

  it('gives every in-scope field a distinct fieldName', () => {
    const names = Object.values(LOG_EDIT_FIELD_SCOPE).map((e) => e.fieldName)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('buildRatingScoreChanges', () => {
  const scores = (entries: Record<string, number>) =>
    Object.entries(entries).map(([categoryId, score]) => ({
      categoryId,
      score,
    }))

  it('records nothing when the save did not touch ratings at all', () => {
    // `undefined` means "absent from the patch", not "cleared".
    expect(buildRatingScoreChanges(scores({ 'cat-1': 80 }), undefined)).toEqual(
      []
    )
  })

  it('records a changed score under its category id', () => {
    const changes = buildRatingScoreChanges(
      scores({ 'cat-1': 80 }),
      scores({ 'cat-1': 90 })
    )

    expect(changes).toEqual([
      {
        fieldName: ratingScoreFieldName('cat-1'),
        category: 'RATING',
        oldValue: '80',
        newValue: '90',
      },
    ])
  })

  it('records a score added for a category that had none', () => {
    const changes = buildRatingScoreChanges([], scores({ 'cat-2': 70 }))

    expect(changes[0]).toMatchObject({ oldValue: null, newValue: '70' })
  })

  it('records a category dropped from the set as a cleared score', () => {
    // The save replaces the score set wholesale, so a missing category means
    // the user removed that score — an edit, not an omission.
    const changes = buildRatingScoreChanges(scores({ 'cat-1': 80 }), [])

    expect(changes[0]).toMatchObject({ oldValue: '80', newValue: null })
  })

  it('ignores a category whose score was re-sent unchanged', () => {
    const changes = buildRatingScoreChanges(
      scores({ 'cat-1': 80, 'cat-2': 60 }),
      scores({ 'cat-1': 80, 'cat-2': 65 })
    )

    expect(changes.map((c) => c.fieldName)).toEqual([
      ratingScoreFieldName('cat-2'),
    ])
  })
})
