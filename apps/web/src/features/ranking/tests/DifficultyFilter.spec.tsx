import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DifficultyFilter } from '../DifficultyFilter'
import { NON_DEMON } from '../rankingModel'
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
  it('offers All, non-demon and the five demon difficulties', () => {
    render()

    for (const label of [
      'All',
      'Non-demon',
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

  it('toggles the non-demon aggregate', async () => {
    const onToggle = vi.fn()
    render({ onToggle })

    await userEvent.click(screen.getByRole('button', { name: 'Non-demon' }))

    expect(onToggle).toHaveBeenCalledWith(NON_DEMON)
  })

  // Collapsed by default: this is a demon tracker, and six extra faces would
  // crowd out the five that get used.
  it('hides the non-demon difficulties until asked for', () => {
    render()

    expect(screen.queryByRole('button', { name: 'Harder' })).toBeNull()
  })

  it('reveals them on hover', async () => {
    render()

    await userEvent.hover(screen.getByRole('button', { name: 'Non-demon' }))

    expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument()
  })

  // A touch device never hovers, so the chevron pins the strip open — and,
  // crucially, keeps it open rather than closing what the cursor is holding.
  it('pins them open from the chevron, and stays open under the cursor', async () => {
    render()

    const chevron = screen.getByRole('button', {
      name: 'Show non-demon difficulties',
    })
    await userEvent.click(chevron)
    expect(screen.getByRole('button', { name: 'Harder' })).toBeInTheDocument()

    await userEvent.click(chevron)
    expect(screen.getByRole('button', { name: 'Harder' })).toBeInTheDocument()

    await userEvent.unhover(chevron)
    expect(screen.queryByRole('button', { name: 'Harder' })).toBeNull()
  })
})
