/**
 * The level filter's search box.
 *
 * The behaviours worth pinning are the ones a user would hit within seconds:
 * typing narrows, Enter takes the top hit without reaching for the mouse, and
 * the box does not close itself on the second keystroke — which is what happens
 * if the popover steals focus when it opens.
 */

import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/utils/testUtils'
import { LevelFilterBox } from '../LevelFilterBox'
import type { LevelOption } from '../eventFilters'

function option(overrides: Partial<LevelOption> = {}): LevelOption {
  const base = {
    levelId: '4284013',
    name: 'Bloodbath',
    creator: 'Riot',
    songName: 'At the Speed of Light',
    inGameDifficulty: 'Extreme Demon',
    featured: true,
    epicValue: 0,
    isRated: true,
    ...overrides,
  }
  return {
    ...base,
    haystack: [base.name, base.creator, base.levelId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }
}

const options = [
  option(),
  option({ levelId: '9999', name: 'Cataclysm', creator: 'Ggb0y' }),
]

function render(selected: LevelOption | null = null) {
  const onSelect = vi.fn()
  const result = renderWithProviders(
    <LevelFilterBox options={options} selected={selected} onSelect={onSelect} />
  )
  return { ...result, onSelect }
}

describe('LevelFilterBox', () => {
  it('shows suggestions once the box is focused, before anything is typed', async () => {
    render()
    await userEvent.click(screen.getByLabelText('Filter by level'))

    expect(screen.getByText('Bloodbath')).toBeInTheDocument()
    expect(screen.getByText('Cataclysm')).toBeInTheDocument()
  })

  it('narrows as the user types, and keeps the box open while they do', async () => {
    render()
    const input = screen.getByLabelText('Filter by level')
    await userEvent.type(input, 'blood')

    expect(screen.getByText('Bloodbath')).toBeInTheDocument()
    expect(screen.queryByText('Cataclysm')).not.toBeInTheDocument()
    // Focus must stay in the box, or the second character would have closed it.
    expect(input).toHaveFocus()
  })

  it('shows the creator alongside the name', async () => {
    render()
    await userEvent.click(screen.getByLabelText('Filter by level'))

    expect(screen.getByText(/by Riot/)).toBeInTheDocument()
  })

  it('picks a level when its row is clicked', async () => {
    const { onSelect } = render()
    await userEvent.click(screen.getByLabelText('Filter by level'))
    await userEvent.click(screen.getByText('Cataclysm'))

    expect(onSelect).toHaveBeenCalledWith('9999')
  })

  it('takes the top suggestion on Enter', async () => {
    const { onSelect } = render()
    await userEvent.type(
      screen.getByLabelText('Filter by level'),
      'cata{Enter}'
    )

    expect(onSelect).toHaveBeenCalledWith('9999')
  })

  it('shows the chosen level in place of the box, with a way back out', async () => {
    const { onSelect } = render(options[0]!)

    expect(screen.getByText('Bloodbath')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by level')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Clear level filter'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
