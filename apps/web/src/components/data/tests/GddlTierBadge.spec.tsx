import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { GddlTierBadge } from '../GddlTierBadge'
import { renderWithProviders } from '@/utils/testUtils'

describe('GddlTierBadge', () => {
  it('shows the tier', () => {
    renderWithProviders(<GddlTierBadge tier={28} />)

    expect(screen.getByText('28')).toBeInTheDocument()
  })

  // It is a table cell: it has to hold its slot when there is no tier, which
  // is what separates it from the TierChip a row of chips uses.
  it('holds the slot with an em dash when there is no tier', () => {
    renderWithProviders(<GddlTierBadge tier={null} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  // Low tiers sit on light backgrounds, so the number has to flip to black.
  // The boundary is 15/16 and is easy to move by accident.
  it('flips the text color at the 15/16 palette boundary', () => {
    const { unmount } = renderWithProviders(<GddlTierBadge tier={15} />)
    expect(screen.getByText('15')).toHaveStyle({ color: '#0d0d0d' })
    unmount()

    renderWithProviders(<GddlTierBadge tier={16} />)
    expect(screen.getByText('16')).toHaveStyle({ color: '#f5f5f5' })
  })
})
