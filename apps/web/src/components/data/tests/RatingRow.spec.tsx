import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RatingRow } from '../RatingRow'
import { renderWithProviders } from '@/utils/testUtils'

const slider = () => screen.getByRole('slider')
const field = (label = 'Gameplay') => screen.getByLabelText(label)

describe('RatingRow', () => {
  it('bounds the control by the field’s own scale, not the internal 0–100', () => {
    const { unmount } = renderWithProviders(
      <RatingRow label="Gameplay" value={7} field="score" onChange={vi.fn()} />
    )
    expect(slider()).toHaveAttribute('aria-valuemax', '10')
    unmount()

    renderWithProviders(
      <RatingRow
        label="Gameplay"
        value={70}
        field="enjoyment"
        onChange={vi.fn()}
      />
    )
    expect(slider()).toHaveAttribute('aria-valuemax', '100')
  })

  it('shows the value it was given, in display units', () => {
    renderWithProviders(
      <RatingRow
        label="Gameplay"
        value={7.5}
        field="score"
        onChange={vi.fn()}
      />
    )

    expect(slider()).toHaveAttribute('aria-valuenow', '7.5')
    expect(field()).toHaveValue('7.5')
  })

  it('renders an unanswered rating as 0 without reporting a change', () => {
    const onChange = vi.fn()
    renderWithProviders(
      <RatingRow
        label="Gameplay"
        value={null}
        field="score"
        onChange={onChange}
      />
    )

    expect(field()).toHaveValue('0.0')
    expect(onChange).not.toHaveBeenCalled()
  })

  // Enjoyment is stored and shown on the same 0–100 scale, so it has no
  // decimal place to offer — a whole number is its finest step.
  it('renders enjoyment as a whole number', () => {
    renderWithProviders(
      <RatingRow
        label="Enjoyment"
        value={null}
        field="enjoyment"
        onChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Enjoyment')).toHaveValue('0')
  })

  it('offers a tenth of a unit for a score and whole units for enjoyment', () => {
    const { unmount } = renderWithProviders(
      <RatingRow label="Gameplay" value={5} field="score" onChange={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: '+.5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+1' })).toBeInTheDocument()
    unmount()

    renderWithProviders(
      <RatingRow
        label="Gameplay"
        value={50}
        field="enjoyment"
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '+5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+10' })).toBeInTheDocument()
  })

  it('reports steps in display units', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <RatingRow label="Gameplay" value={5} field="score" onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: '+1' }))

    // 6, not 60 — the caller converts to internal units at its own boundary.
    expect(onChange).toHaveBeenCalledWith(6)
  })

  it('names the stepper after the row, so two rows on a page stay distinguishable', () => {
    renderWithProviders(
      <RatingRow
        label="Decoration"
        value={5}
        field="score"
        onChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Decoration')).toBeInTheDocument()
  })

  it('renders a sublabel when given one', () => {
    renderWithProviders(
      <RatingRow
        label="Gameplay"
        sublabel="weighted 40%"
        value={5}
        field="score"
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('weighted 40%')).toBeInTheDocument()
  })
})
