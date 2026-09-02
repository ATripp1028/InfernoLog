import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RatingSection } from '../RatingSection'
import { renderWithProviders } from '@/utils/testUtils'

const mutateAsync = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUpdateMe: () => ({ mutateAsync, isPending: false }),
}))

const me = (ratingMode = 'SIMPLE') =>
  ({
    ratingMode,
    ratingDisplayScale: 'ZERO_TO_TEN',
    ratingCategories: [],
    includeEnjoyment: false,
    enjoymentWeight: 0,
  }) as never

describe('RatingSection', () => {
  it('offers all three rating modes', () => {
    renderWithProviders(<RatingSection me={me()} />)

    for (const label of ['Simple', 'Weighted', 'Manual']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  // A switch reorders the whole Ranking page and hides every number the old
  // mode showed. Nothing is deleted, but it is startling enough to confirm.
  it('does not switch until the change is confirmed', async () => {
    renderWithProviders(<RatingSection me={me()} />)
    mutateAsync.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Weighted' }))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Switch to weighted rating\?/)
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Switch' }))

    expect(mutateAsync).toHaveBeenCalledWith({ ratingMode: 'WEIGHTED' })
  })

  it('abandons the switch on cancel', async () => {
    renderWithProviders(<RatingSection me={me()} />)
    mutateAsync.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Manual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  // The warning has to be true: a mode switch deletes nothing, and saying it
  // does would be a lie the user could disprove by switching back.
  it('promises the switch keeps existing data', async () => {
    renderWithProviders(<RatingSection me={me()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Manual' }))

    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument()
  })

  it('confirms a switch away from manual too, not just towards it', async () => {
    renderWithProviders(<RatingSection me={me('MANUAL')} />)
    mutateAsync.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Simple' }))

    expect(screen.getByText(/re-sort/)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
