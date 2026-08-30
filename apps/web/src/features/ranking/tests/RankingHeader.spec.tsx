import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RankingHeader } from '../RankingHeader'
import { DEFAULT_SORT, OVERALL_SORT } from '../rankingModel'
import { renderWithProviders } from '@/utils/testUtils'

const CATEGORIES = [
  { id: 'gameplay', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
  { id: 'design', name: 'Decoration', weight: 0.3, sortOrder: 1 },
  { id: 'song', name: 'Song', weight: 0.2, sortOrder: 2 },
]

const render = (props: Partial<Parameters<typeof RankingHeader>[0]> = {}) =>
  renderWithProviders(
    <RankingHeader
      categories={CATEGORIES}
      sort={DEFAULT_SORT}
      onSort={vi.fn()}
      {...props}
    />
  )

describe('RankingHeader', () => {
  it('labels every column the rows carry', () => {
    render()

    expect(screen.getByText('Level')).toBeInTheDocument()
    for (const label of ['Gameplay', 'Decoration', 'Song', 'Overall']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  // The leftmost category is the one that decides a tie between two equal
  // averages, so the columns have to read in that same priority order.
  it('renders the categories in the order it is given', () => {
    render()

    expect(
      screen.getAllByRole('button').map((b) => b.textContent)
    ).toEqual(['Gameplay', 'Decoration', 'Song', 'Overall'])
  })

  it('asks to sort by the column that was clicked', async () => {
    const onSort = vi.fn()
    render({ onSort })

    await userEvent.click(screen.getByRole('button', { name: 'Decoration' }))

    expect(onSort).toHaveBeenCalledWith('design')
  })

  it('offers the ranking’s own order as a column too', async () => {
    const onSort = vi.fn()
    render({ onSort })

    await userEvent.click(screen.getByRole('button', { name: 'Overall' }))

    expect(onSort).toHaveBeenCalledWith(OVERALL_SORT)
  })

  it('marks only the active column with its direction', () => {
    render({ sort: { key: 'song', dir: 'asc' } })

    expect(screen.getByRole('button', { name: 'Song' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )
    expect(screen.getByRole('button', { name: 'Gameplay' })).toHaveAttribute(
      'aria-sort',
      'none'
    )
  })
})
