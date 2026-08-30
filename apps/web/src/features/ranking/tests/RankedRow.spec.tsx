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

  // The exceptions at either end of the scale are the point of it — a 10 and
  // a 0 have to be recognisable at a glance, not just the ends of a ramp.
  it('tints the name and the overall rating by the rating itself', async () => {
    const { unmount } = await renderWithProviders(
      <RankedRow entry={entry(1, 100)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )
    expect(screen.getByText('#1 — Tartarus')).toHaveStyle({ color: '#ffd43b' })
    expect(screen.getByText('10')).toHaveStyle({ color: '#ffd43b' })
    unmount()

    await renderWithProviders(
      <RankedRow entry={entry(1, 0)} scale="ZERO_TO_TEN" {...base} />,
      { router: true }
    )
    expect(screen.getByText('#1 — Tartarus')).toHaveStyle({ color: '#dc143c' })
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
