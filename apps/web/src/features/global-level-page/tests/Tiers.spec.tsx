import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeGlobalLevel } from '@/utils/testUtils'
import { Tiers } from '../Tiers'
import { tierEntries } from '../tierEntries'

describe('Tiers', () => {
  it('renders every row with its badge, name and source', () => {
    const level = makeGlobalLevel({
      inGameId: '86407629',
      gddlTier: 39,
      aredlRank: 5,
      sheetTier: 20,
    })
    render(<Tiers entries={tierEntries(level)} variant="card" />)

    expect(screen.getByText('GDDL')).toBeInTheDocument()
    expect(screen.getByText('39')).toBeInTheDocument()
    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.getByText('Nightmare')).toBeInTheDocument()
    expect(screen.getByText('LW')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /GDDL/ })).toHaveAttribute(
      'href',
      'https://gdladder.com/level/86407629'
    )
  })

  it('offers the tier-0 explanation and links to the sheet holding it', () => {
    const level = makeGlobalLevel({ sheetTier: 0 })
    render(<Tiers entries={tierEntries(level)} />)

    expect(screen.getByText('Fuck')).toBeInTheDocument()
    expect(screen.getByText('NLW')).toBeInTheDocument()
    // Tier 0 reads as "easier than Beginner" without this.
    expect(
      screen.getByRole('button', { name: 'What does tier 0 mean?' })
    ).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('docs.google.com/spreadsheets')
    )
  })
})
