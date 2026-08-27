import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { GddlTierBadge } from '../GddlTierBadge'
import { renderWithProviders } from '@/utils/testUtils'

describe('GddlTierBadge', () => {
  it('shows the tier in either variant', () => {
    const { unmount } = renderWithProviders(<GddlTierBadge tier={28} />)
    expect(screen.getByText('28')).toBeInTheDocument()
    unmount()

    renderWithProviders(<GddlTierBadge tier={28} variant="inline" />)
    expect(screen.getByText('28')).toBeInTheDocument()
  })

  // The whole reason the two variants exist: a table cell has to hold its slot
  // when there is no tier, while an inline badge must not invent one.
  it('holds the slot with an em dash when a cell has no tier', () => {
    renderWithProviders(<GddlTierBadge tier={null} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders nothing at all when an inline badge has no tier', () => {
    const { container } = renderWithProviders(
      <GddlTierBadge tier={null} variant="inline" />
    )

    expect(container).toBeEmptyDOMElement()
  })

  // Low tiers sit on light backgrounds, so the number has to flip to black.
  // The boundary is 15/16 and is easy to move by accident.
  it('flips the text colour at the 15/16 palette boundary', () => {
    const { unmount } = renderWithProviders(<GddlTierBadge tier={15} />)
    expect(screen.getByText('15')).toHaveStyle({ color: '#0d0d0d' })
    unmount()

    renderWithProviders(<GddlTierBadge tier={16} />)
    expect(screen.getByText('16')).toHaveStyle({ color: '#f5f5f5' })
  })
})
