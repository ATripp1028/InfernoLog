import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from '../chip'
import { renderWithProviders } from '@/utils/testUtils'

describe('Chip', () => {
  it('announces its selected state as a toggle rather than relying on colour', () => {
    const { unmount } = renderWithProviders(<Chip selected>Rated</Chip>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    unmount()

    renderWithProviders(<Chip>Rated</Chip>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('defaults to unselected', () => {
    renderWithProviders(<Chip>Rated</Chip>)

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('never submits the form it sits in', () => {
    // The filter panel lives inside a form; a chip defaulting to type="submit"
    // would submit it on every filter toggle.
    renderWithProviders(<Chip>Rated</Chip>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('forwards click handling', async () => {
    const onClick = vi.fn()
    renderWithProviders(<Chip onClick={onClick}>Rated</Chip>)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
