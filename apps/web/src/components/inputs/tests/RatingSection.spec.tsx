import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { RatingSection } from '../RatingSection'
import { makeMe, renderWithProviders } from '@/utils/testUtils'

// The editor's save writer, which reaches for the auth context this spec does
// not stand up. Mocked at the module boundary — nothing here saves.
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUpdateRatingConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('RatingSection', () => {
  it('renders the category editor', () => {
    renderWithProviders(<RatingSection me={makeMe()} />)

    expect(
      screen.getByRole('textbox', { name: /Weight for Overall/ })
    ).toBeInTheDocument()
  })

  // There is one rating system: a level's rating is the weighted average of
  // its category scores, and a single category at 100% is how an account rates
  // on one number. The old mode buttons are what makes their absence
  // assertable.
  it('offers no rating-mode choice', () => {
    renderWithProviders(<RatingSection me={makeMe()} />)

    expect(screen.queryByText('Rating mode')).not.toBeInTheDocument()
    for (const label of ['Simple', 'Weighted', 'Manual']) {
      expect(
        screen.queryByRole('button', { name: label })
      ).not.toBeInTheDocument()
    }
  })

  // The scale is fixed per field too — scores 0–10, enjoyment 0–100 — so there
  // is nothing here to choose. The buttons were labelled with the two scales.
  it('offers no display-scale choice', () => {
    renderWithProviders(<RatingSection me={makeMe()} />)

    expect(screen.queryByText('Display scale')).not.toBeInTheDocument()
    for (const label of ['0–10', '0–100']) {
      expect(
        screen.queryByRole('button', { name: label })
      ).not.toBeInTheDocument()
    }
  })
})
