import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { TierChip, TierChips } from '../TierChip'
import { communityTierChips } from '@/lib/communityTiers'
import { renderWithProviders } from '@/utils/testUtils'

const level = {
  gddlTier: 34,
  aredlRank: 5,
  aredlStatus: 'MainList',
  sheetTier: 20,
}

describe('TierChip', () => {
  it('shows the badge and names the list for assistive tech', () => {
    const [gddl] = communityTierChips({
      ...level,
      aredlRank: null,
      sheetTier: null,
    })
    renderWithProviders(<TierChip chip={gddl!} />)

    expect(screen.getByText('34')).toBeInTheDocument()
    // The icon carries the list visually, so the label is the accessible name.
    expect(screen.getByText('GDDL tier:')).toBeInTheDocument()
  })

  it('marks which spreadsheet a sheet tier came from', () => {
    const [sheet] = communityTierChips({
      gddlTier: null,
      aredlRank: null,
      aredlStatus: null,
      sheetTier: 20,
    })
    renderWithProviders(<TierChip chip={sheet!} />)

    expect(screen.getByText('Nightmare')).toBeInTheDocument()
    expect(screen.getByText('LW')).toBeInTheDocument()
  })
})

describe('TierChips', () => {
  it('renders one chip per list the level is on', () => {
    renderWithProviders(<TierChips chips={communityTierChips(level)} />)

    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.getByText('Nightmare')).toBeInTheDocument()
  })

  // A row with no placements must not render an empty chip row — the demon
  // list's unplaced cards say so in words instead.
  it('shows the fallback when the level is on no list', () => {
    renderWithProviders(
      <TierChips
        chips={communityTierChips({
          gddlTier: null,
          aredlRank: null,
          aredlStatus: null,
          sheetTier: null,
        })}
        fallback={<span>No list reference</span>}
      />
    )

    expect(screen.getByText('No list reference')).toBeInTheDocument()
  })

  it('renders nothing at all when there are no chips and no fallback', () => {
    const { container } = renderWithProviders(<TierChips chips={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
