import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { RankingHeader } from '../RankingHeader'
import { renderWithProviders } from '@/utils/testUtils'

const CATEGORIES = [
  { id: 'gameplay', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
  { id: 'design', name: 'Decoration', weight: 0.3, sortOrder: 1 },
  { id: 'song', name: 'Song', weight: 0.2, sortOrder: 2 },
]

describe('RankingHeader', () => {
  it('labels every column the rows carry', () => {
    renderWithProviders(<RankingHeader categories={CATEGORIES} />)

    for (const label of [
      'Level',
      'Gameplay',
      'Decoration',
      'Song',
      'Overall',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  // The leftmost category is the one that decides a tie between two equal
  // averages, so the columns have to read in that same priority order.
  it('renders the categories in the order it is given', () => {
    const { container } = renderWithProviders(
      <RankingHeader categories={CATEGORIES} />
    )

    const labels = [...container.querySelectorAll('span')].map((s) => s.textContent)

    expect(labels.filter((l) => l && l !== '')).toEqual([
      'Level',
      'Gameplay',
      'Decoration',
      'Song',
      'Overall',
    ])
  })
})
