import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OverallRatingConfig } from '@infernolog/core'
import { RowEditor } from '../RowEditor'
import { renderWithProviders } from '@/utils/testUtils'

// One category at the full weight — the shape a fresh account has.
const SOLE: OverallRatingConfig = {
  includeEnjoyment: false,
  enjoymentWeight: 0,
  categoryWeights: new Map([['overall', 1]]),
}

const SOLE_CATEGORY = [
  { id: 'overall', name: 'Overall', weight: 1, sortOrder: 0 },
]

const WEIGHTED: OverallRatingConfig = {
  includeEnjoyment: false,
  enjoymentWeight: 0,
  categoryWeights: new Map([
    ['gameplay', 0.5],
    ['design', 0.5],
  ]),
}

const CATEGORIES = [
  { id: 'gameplay', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
  { id: 'design', name: 'Decoration', weight: 0.5, sortOrder: 1 },
]

const render = (props: Partial<Parameters<typeof RowEditor>[0]> = {}) =>
  renderWithProviders(
    <RowEditor
      levelId="128"
      identity={<span>Tartarus</span>}
      config={SOLE}
      categories={SOLE_CATEGORY}
      ratingScores={[{ categoryId: 'overall', score: 80 }]}
      enjoyment={null}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      saving={false}
      {...props}
    />
  )

describe('RowEditor', () => {
  it('seeds each field from the score the level already carries', () => {
    render()

    expect(screen.getByLabelText('Overall score')).toHaveValue('8.0')
  })

  it('offers one field per category', () => {
    render({
      config: WEIGHTED,
      categories: CATEGORIES,
      ratingScores: [
        { categoryId: 'gameplay', score: 90 },
        { categoryId: 'design', score: 70 },
      ],
    })

    expect(screen.getByLabelText('Gameplay score')).toHaveValue('9.0')
    expect(screen.getByLabelText('Decoration score')).toHaveValue('7.0')
    expect(screen.queryByLabelText('Overall score')).not.toBeInTheDocument()
  })

  // The average hides its arithmetic, so the figure that decides the row's
  // position is shown rather than left to be inferred.
  it('shows the resulting overall rating', () => {
    render({
      config: WEIGHTED,
      categories: CATEGORIES,
      ratingScores: [
        { categoryId: 'gameplay', score: 90 },
        { categoryId: 'design', score: 70 },
      ],
    })

    expect(screen.getByTitle('Overall')).toHaveTextContent('8')
  })

  // The preview exists to promise the row will settle where it says. Enjoyment
  // is not editable here, but `includeEnjoyment` folds it into the weighted
  // average, so dropping it would break that promise on save.
  it('folds enjoyment into the preview when the user opted in', () => {
    render({
      config: {
        ...WEIGHTED,
        includeEnjoyment: true,
        enjoymentWeight: 1,
      },
      categories: CATEGORIES,
      ratingScores: [
        { categoryId: 'gameplay', score: 60 },
        { categoryId: 'design', score: 60 },
      ],
      enjoyment: 90,
    })

    // (60×0.5 + 60×0.5 + 90×1) / 2 = 75 internal → 7.5 on the 0–10 scale.
    // Ignoring enjoyment would read 6 instead.
    expect(screen.getByTitle('Overall')).toHaveTextContent('7.5')
  })

  it('sends every category score back on the internal scale', async () => {
    const onSave = vi.fn()
    render({
      config: WEIGHTED,
      categories: CATEGORIES,
      ratingScores: [{ categoryId: 'gameplay', score: 90 }],
      onSave,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Save rating' }))

    // A category with no score yet goes back as 0, not omitted.
    expect(onSave).toHaveBeenCalledWith({
      levelId: '128',
      ratingScores: [
        { categoryId: 'gameplay', score: 90 },
        { categoryId: 'design', score: 0 },
      ],
    })
  })

  // A save in flight must not be abandonable: the row is mid-commit, and
  // closing the editor would leave nothing for a failure to fail back into.
  it('locks both buttons while a save is in flight', () => {
    render({ saving: true })

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving rating' })).toBeDisabled()
  })

  it('swaps the submit button for a spinner while saving', () => {
    const { unmount } = render({ saving: true })
    expect(
      screen.getByRole('button', { name: 'Saving rating' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save rating' })).toBeNull()
    unmount()

    render()
    expect(
      screen.getByRole('button', { name: 'Save rating' })
    ).toBeInTheDocument()
  })

  it('renders the identity block it is given', () => {
    render({ identity: <span>Tartarus</span> })

    expect(screen.getByText('Tartarus')).toBeInTheDocument()
  })

  it('cancels without saving', async () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render({ onSave, onCancel })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
