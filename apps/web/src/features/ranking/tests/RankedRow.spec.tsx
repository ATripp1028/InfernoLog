import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { RankedRow } from '../RankedRow'
import { makeLevel, makeListItem, renderWithProviders } from '@/utils/testUtils'

const entry = (rank: number, rating: number | null, tier: number | null = null) => ({
  rank,
  item: makeListItem({
    level: makeLevel({ inGameId: '128', name: 'Tartarus', creator: 'Riot' }),
    overallRating: rating,
    userGddlTier: tier,
  }),
})

describe('RankedRow', () => {
  it('leads with the position and the level name', async () => {
    await renderWithProviders(
      <RankedRow entry={entry(3, 84.2)} scale="ZERO_TO_TEN" />,
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
      <RankedRow entry={entry(1, 84.2)} scale="ZERO_TO_TEN" />,
      { router: true }
    )
    expect(screen.getByText('8.42')).toBeInTheDocument()
    unmount()

    await renderWithProviders(
      <RankedRow entry={entry(1, 84.2)} scale="ZERO_TO_HUNDRED" />,
      { router: true }
    )
    expect(screen.getByText('84.2')).toBeInTheDocument()
  })

  it('links to the level’s own page', async () => {
    await renderWithProviders(
      <RankedRow entry={entry(1, 90)} scale="ZERO_TO_TEN" />,
      { router: true }
    )

    expect(screen.getByRole('link')).toHaveAttribute('href', '/log/128')
  })

  it('shows a tier badge only when a tier is logged', async () => {
    const { unmount } = await renderWithProviders(
      <RankedRow entry={entry(1, 90, 35)} scale="ZERO_TO_TEN" />,
      { router: true }
    )
    expect(screen.getByText('35')).toBeInTheDocument()
    unmount()

    await renderWithProviders(
      <RankedRow entry={entry(1, 90, null)} scale="ZERO_TO_TEN" />,
      { router: true }
    )
    // The inline badge renders nothing rather than a placeholder dash.
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})
