/**
 * One feed row.
 *
 * What is worth asserting here rather than in feedContent.spec is the shape of
 * the row: that both tables render as the same kind of line, that a row with
 * more to say hides it until asked, and that a bulk replace expands into the
 * levels it moved rather than into a count on its own.
 */

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressUpdateKind } from '@infernolog/core'
import type {
  ActivityFeedEvent,
  ActivityFeedItem,
  ActivityLevelImpact,
} from '@infernolog/core'
import { renderWithProviders } from '@/utils/testUtils'
import { FeedRow, type FeedRowContext } from '../FeedRow'

const context: FeedRowContext = {
  datePref: 'ISO',
  scale: 'ZERO_TO_TEN',
  categories: [{ id: 'cat-1', name: 'Gameplay', weight: 1, sortOrder: 0 }],
}

function impact(
  overrides: Partial<ActivityLevelImpact> = {}
): ActivityLevelImpact {
  return {
    levelId: '123',
    levelName: 'Slaughterhouse',
    role: 'MOVER',
    positionBefore: null,
    positionAfter: 4,
    milestoneCrossed: null,
    ...overrides,
  }
}

function event(overrides: Partial<ActivityFeedEvent> = {}): ActivityFeedItem {
  return {
    source: 'EVENT',
    id: 'e1',
    recordedAt: new Date('2026-08-25T16:41:00Z'),
    sequence: 1,
    eventType: 'DEMON_LIST_PLACEMENT',
    levelId: '123',
    levelName: 'Slaughterhouse',
    fieldChanges: [],
    levelImpacts: [impact()],
    impactCount: 1,
    ...overrides,
  }
}

// The level name is a Link, so the row needs a router around it.
function render(item: ActivityFeedItem) {
  return renderWithProviders(<FeedRow item={item} context={context} />, {
    router: true,
  })
}

describe('FeedRow', () => {
  it('renders a progress update as a sentence, not as a table row', async () => {
    await render({
      source: 'PROGRESS',
      id: 'p1',
      recordedAt: new Date('2026-08-25T16:02:00Z'),
      kind: ProgressUpdateKind.COMPLETION,
      levelId: '123',
      levelName: 'Slaughterhouse',
      date: null,
      dateTimezone: null,
      dateUncertain: false,
      percentage: null,
      runFrom: null,
      runTo: null,
      attempts: 43530,
      enjoyment: null,
    })
    expect(screen.getByText('Beat')).toBeInTheDocument()
    expect(screen.getByText('Slaughterhouse')).toBeInTheDocument()
    expect(screen.getByText(/43,530 attempts/)).toBeInTheDocument()
  })

  it('shows a milestone the placement crossed', async () => {
    await render(
      event({
        levelImpacts: [impact({ positionAfter: 4, milestoneCrossed: 5 })],
      })
    )
    expect(screen.getByText('Entered the top 5')).toBeInTheDocument()
  })

  it('gives a ranking move no expander — there is nothing more to say', async () => {
    await render(event())
    expect(screen.queryByLabelText('Show details')).not.toBeInTheDocument()
  })

  it('hides an edit’s field diffs until asked, then shows them', async () => {
    await render(
      event({
        eventType: 'LOG_EDIT',
        levelImpacts: [],
        impactCount: 0,
        fieldChanges: [
          {
            fieldName: 'rating_score:cat-1',
            category: 'RATING',
            oldValue: '82',
            newValue: '91',
          },
        ],
      })
    )
    expect(screen.queryByText('Gameplay')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Show details'))

    expect(screen.getByText('Gameplay')).toBeInTheDocument()
    // Converted into the viewer's 0–10 scale, not shown as stored.
    expect(screen.getByText('8.2')).toBeInTheDocument()
    expect(screen.getByText('9.1')).toBeInTheDocument()
  })

  it('expands a bulk replace into the levels it moved', async () => {
    await render(
      event({
        eventType: 'DEMON_LIST_BULK_REPLACE',
        levelId: null,
        levelName: null,
        levelImpacts: [
          impact({ levelName: 'Acheron', positionBefore: 7, positionAfter: 3 }),
          impact({
            levelName: 'Bloodlust',
            positionBefore: 19,
            positionAfter: null,
          }),
        ],
        impactCount: 42,
      })
    )
    expect(screen.getByText('42 levels reordered')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Show details'))

    expect(screen.getByText('Acheron')).toBeInTheDocument()
    // A level the replace dropped out of the ranking entirely.
    expect(screen.getByText('out')).toBeInTheDocument()
    // The preview is capped, so the row says what it is not showing.
    expect(screen.getByText(/40 more levels/)).toBeInTheDocument()
  })
})
