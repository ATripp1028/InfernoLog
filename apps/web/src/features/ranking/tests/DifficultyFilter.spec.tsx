import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DifficultyFilter } from '../DifficultyFilter'
import { renderWithProviders } from '@/utils/testUtils'

const render = (props: Partial<Parameters<typeof DifficultyFilter>[0]> = {}) =>
  renderWithProviders(
    <DifficultyFilter
      selected={[]}
      onToggle={vi.fn()}
      onClear={vi.fn()}
      {...props}
    />
  )

describe('DifficultyFilter', () => {
  it('offers All and the five demon difficulties', () => {
    render()

    for (const label of [
      'All',
      'Easy Demon',
      'Medium Demon',
      'Hard Demon',
      'Insane Demon',
      'Extreme Demon',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('marks All as active only when nothing is selected', () => {
    const { unmount } = render()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    unmount()

    render({ selected: ['Easy Demon'] })
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('clears back to All', async () => {
    const onClear = vi.fn()
    render({ selected: ['Easy Demon'], onClear })

    await userEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(onClear).toHaveBeenCalled()
  })

  it('toggles a demon difficulty', async () => {
    const onToggle = vi.fn()
    render({ onToggle })

    await userEvent.click(screen.getByRole('button', { name: 'Hard Demon' }))

    expect(onToggle).toHaveBeenCalledWith('Hard Demon')
  })

  // Nothing else is offered: a rated non-demon cannot be logged, and an unrated
  // level has no difficulty of its own to filter by.
  it.each(['Harder', 'Auto', 'Non-demon'])('does not offer %s', (label) => {
    render()

    expect(screen.queryByRole('button', { name: label })).toBeNull()
  })
})
