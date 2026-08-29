import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OverallRatingConfig } from '@infernolog/core'
import { RowEditor } from '../RowEditor'
import { renderWithProviders } from '@/utils/testUtils'

const SIMPLE: OverallRatingConfig = {
  ratingMode: 'SIMPLE',
  includeEnjoyment: false,
  enjoymentWeight: 0,
  categoryWeights: new Map(),
}

const WEIGHTED: OverallRatingConfig = {
  ratingMode: 'WEIGHTED',
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
      scale="ZERO_TO_TEN"
      config={SIMPLE}
      categories={[]}
      overallRating={80}
      ratingScores={[]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      saving={false}
      {...props}
    />
  )

describe('RowEditor', () => {
  it('offers one field in SIMPLE mode, seeded from the current rating', () => {
    render()

    expect(screen.getByLabelText('Rating score')).toHaveValue('8.0')
  })

  it('offers one field per category in WEIGHTED mode', () => {
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
    expect(screen.queryByLabelText('Rating score')).not.toBeInTheDocument()
  })

  // Weighted mode hides its arithmetic, so the figure that decides the row's
  // position is shown rather than left to be inferred.
  it('shows the resulting overall rating in WEIGHTED mode only', () => {
    const { unmount } = render({
      config: WEIGHTED,
      categories: CATEGORIES,
      ratingScores: [
        { categoryId: 'gameplay', score: 90 },
        { categoryId: 'design', score: 70 },
      ],
    })
    expect(screen.getByText('Overall')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    unmount()

    render()
    expect(screen.queryByText('Overall')).not.toBeInTheDocument()
  })

  it('sends the simple rating back on the internal scale', async () => {
    const onSave = vi.fn()
    render({ onSave })

    await userEvent.click(screen.getByRole('button', { name: 'Save rating' }))

    // 8.0 display on the 0–10 scale is 80 internally.
    expect(onSave).toHaveBeenCalledWith({ levelId: '128', simpleRating: 80 })
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

  it('cancels without saving', async () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render({ onSave, onCancel })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
