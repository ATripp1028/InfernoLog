import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { RankedRow } from '../RankedRow'
import { makeLevel, makeListItem, renderWithProviders } from '@/utils/testUtils'
import type { OverallRatingConfig } from '@infernolog/core'

const SIMPLE: OverallRatingConfig = {
  ratingMode: 'SIMPLE',
  includeEnjoyment: false,
  enjoymentWeight: 0,
  categoryWeights: new Map(),
}

// The props every case shares; a case that cares about one overrides it.
const base = {
  // Far enough down that a rank-1 row under test is not also the last one.
  lastRank: 10,
  config: SIMPLE,
  categories: [],
  editing: false,
  onEdit: () => {},
  onCancel: () => {},
  onSave: () => {},
  saving: false,
}

const entry = (rank: number, rating: number | null) => ({
  rank,
  item: makeListItem({
    level: makeLevel({ inGameId: '128', name: 'Tartarus', creator: 'Riot' }),
    overallRating: rating,
  }),
})

describe('RankedRow', () => {
  it('leads with the position and the level name', async () => {
    await renderWithProviders(
      <RankedRow entry={entry(3, 84.2)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )

    expect(screen.getByText('#3 — Tartarus')).toBeInTheDocument()
    expect(screen.getByText('Published by Riot')).toBeInTheDocument()
  })

  // Ratings are stored 0–100 internally whatever the user's display scale, so
  // the row has to convert rather than print the stored number.
  it('converts the stored rating to the display scale', async () => {
    // 84.2 internal — a weighted average, which carries decimals where a
    // simple rating would be a whole integer.
    const { unmount } = await renderWithProviders(
      <RankedRow entry={entry(1, 84.2)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )
    expect(screen.getByText('8.42')).toBeInTheDocument()
    unmount()

    await renderWithProviders(
      <RankedRow entry={entry(1, 84.2)} scale="ZERO_TO_HUNDRED" {...base} />,
      { router: true }
    )
    expect(screen.getByText('84.2')).toBeInTheDocument()
  })

  // The overall rating's extremes are anchored to the RANKING, not the scale:
  // a weighted average only hits a flat 10 or 0 if every category agrees, so
  // the marks would otherwise go unused. The name carries the same figure and
  // so the same colour.
  it('tints the top of the ranking gold, whatever the rating', async () => {
    await renderWithProviders(
      <RankedRow entry={entry(1, 84.2)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )

    expect(screen.getByText('#1 — Tartarus')).toHaveStyle({ color: '#ffd43b' })
    expect(screen.getByText('8.42')).toHaveStyle({ color: '#ffd43b' })
  })

  it('tints the bottom of the ranking crimson', async () => {
    await renderWithProviders(
      <RankedRow entry={entry(10, 62)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )

    expect(screen.getByText('#10 — Tartarus')).toHaveStyle({ color: '#dc143c' })
    expect(screen.getByText('6.2')).toHaveStyle({ color: '#dc143c' })
  })

  it('leaves a level in the middle on the gradient, even at a perfect score', async () => {
    await renderWithProviders(
      <RankedRow entry={entry(5, 100)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )

    const name = screen.getByText('#5 — Tartarus')
    expect(name).not.toHaveStyle({ color: '#ffd43b' })
    expect(name).not.toHaveStyle({ color: '#dc143c' })
  })

  // Category scores keep the scale-anchored rule: a flat 10 is something a
  // user really types, and it should read as one.
  it('still tints a flat category score by its value', async () => {
    const categories = [
      { id: 'gameplay', name: 'Gameplay', weight: 1, sortOrder: 0 },
    ]
    const e = entry(5, 84.2)
    e.item.ratingScores = [{ categoryId: 'gameplay', score: 100 }]

    await renderWithProviders(
      <RankedRow entry={e} scale="ZERO_TO_TEN" {...base} categories={categories} />,
      { router: true }
    )

    expect(screen.getByText('10')).toHaveStyle({ color: '#ffd43b' })
  })

  it('links to the level’s own page', async () => {
    await renderWithProviders(
      <RankedRow entry={entry(1, 90)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )

    expect(screen.getByRole('link')).toHaveAttribute('href', '/log/128')
  })

  // WEIGHTED mode only. The per-category breakdown is what the sticky header
  // labels, so the two have to carry the same columns in the same order.
  it('shows one cell per category, in the order given', async () => {
    const categories = [
      { id: 'gameplay', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
      { id: 'song', name: 'Song', weight: 0.5, sortOrder: 1 },
    ]
    const e = entry(1, 84.2)
    e.item.ratingScores = [
      { categoryId: 'song', score: 70 },
      { categoryId: 'gameplay', score: 90 },
    ]

    await renderWithProviders(
      <RankedRow entry={e} scale="ZERO_TO_TEN" {...base} categories={categories} />,
      { router: true }
    )

    // Column order follows `categories`, not the order the scores arrived in.
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('dashes a category the level has no score for', async () => {
    const categories = [
      { id: 'gameplay', name: 'Gameplay', weight: 1, sortOrder: 0 },
    ]
    const e = entry(1, 84.2)
    e.item.ratingScores = []

    await renderWithProviders(
      <RankedRow entry={e} scale="ZERO_TO_TEN" {...base} categories={categories} />,
      { router: true }
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  // SIMPLE mode passes no categories, and the row must not invent columns.
  it('renders no category cells without categories', async () => {
    const e = entry(1, 84.2)
    e.item.ratingScores = [{ categoryId: 'gameplay', score: 90 }]

    await renderWithProviders(
      <RankedRow entry={e} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )

    expect(screen.queryByText('9')).not.toBeInTheDocument()
  })

})
