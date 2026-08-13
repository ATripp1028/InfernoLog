import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LevelResultRow, type LevelResultRowLevel } from '../LevelResultRow'
import { renderWithProviders } from '@/utils/testUtils'

function level(
  overrides: Partial<LevelResultRowLevel> = {}
): LevelResultRowLevel {
  return {
    inGameId: '4284013',
    name: 'Bloodbath',
    creator: 'Riot',
    songName: 'At the Speed of Light',
    inGameDifficulty: 'EXTREME_DEMON',
    featured: true,
    epicValue: 0,
    isRated: true,
    ...overrides,
  }
}

const row = () => screen.getByRole('button')

describe('LevelResultRow', () => {
  it('names an unnamed level by its in-game id', () => {
    renderWithProviders(
      <LevelResultRow level={level({ name: null })} onSelect={vi.fn()} />
    )

    expect(screen.getByText('Level #4284013')).toBeInTheDocument()
  })

  it('joins creator and song into one meta line', () => {
    renderWithProviders(<LevelResultRow level={level()} onSelect={vi.fn()} />)

    expect(
      screen.getByText('by Riot · At the Speed of Light')
    ).toBeInTheDocument()
  })

  it('drops the missing half of the meta line rather than leaving a separator', () => {
    const { unmount } = renderWithProviders(
      <LevelResultRow level={level({ songName: null })} onSelect={vi.fn()} />
    )
    expect(screen.getByText('by Riot')).toBeInTheDocument()
    unmount()

    renderWithProviders(
      <LevelResultRow level={level({ creator: null })} onSelect={vi.fn()} />
    )
    expect(screen.getByText('At the Speed of Light')).toBeInTheDocument()
  })

  it('shows the level id in the right-hand slot by default', () => {
    renderWithProviders(<LevelResultRow level={level()} onSelect={vi.fn()} />)

    expect(screen.getByText('#4284013')).toBeInTheDocument()
  })

  it('replaces the id with a badge, and a badge always disables the row', async () => {
    const onSelect = vi.fn()
    renderWithProviders(
      <LevelResultRow
        level={level()}
        onSelect={onSelect}
        badge="Already added"
      />
    )

    expect(screen.getByText('Already added')).toBeInTheDocument()
    expect(screen.queryByText('#4284013')).not.toBeInTheDocument()
    expect(row()).toBeDisabled()

    await userEvent.click(row())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('takes the right-hand slot for the spinner while loading, outranking the badge', () => {
    const { container } = renderWithProviders(
      <LevelResultRow
        level={level()}
        onSelect={vi.fn()}
        badge="Already added"
        loading
      />
    )

    expect(screen.queryByText('Already added')).not.toBeInTheDocument()
    expect(screen.queryByText('#4284013')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('can be disabled without a badge, for a reason belonging to another row', () => {
    renderWithProviders(
      <LevelResultRow level={level()} onSelect={vi.fn()} disabled />
    )

    expect(row()).toBeDisabled()
    // No badge, so the id still shows — the row is blocked, not annotated.
    expect(screen.getByText('#4284013')).toBeInTheDocument()
  })

  it('selects on click when nothing blocks it', async () => {
    const onSelect = vi.fn()
    renderWithProviders(<LevelResultRow level={level()} onSelect={onSelect} />)

    await userEvent.click(row())

    expect(onSelect).toHaveBeenCalledOnce()
  })
})
