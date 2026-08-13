import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from '../segmented'
import { renderWithProviders } from '@/utils/testUtils'

const OPTIONS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'pc', label: 'PC' },
] as const

describe('Segmented', () => {
  it('marks only the active option as pressed', () => {
    renderWithProviders(
      <Segmented options={OPTIONS} value="pc" onChange={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'Mobile' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('button', { name: 'PC' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('presses nothing while the field is unanswered', () => {
    renderWithProviders(
      <Segmented options={OPTIONS} value={null} onChange={vi.fn()} />
    )

    for (const name of ['Mobile', 'PC']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    }
  })

  it('emits the value of the option clicked', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <Segmented options={OPTIONS} value={null} onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'PC' }))

    expect(onChange).toHaveBeenCalledWith('pc')
  })

  it('re-emits the same value when the active option is clicked, so a required field cannot be cleared', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <Segmented options={OPTIONS} value="pc" onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'PC' }))

    expect(onChange).toHaveBeenCalledWith('pc')
  })

  it('clears to null when the active option is clicked and deselection is allowed', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <Segmented options={OPTIONS} value="pc" allowDeselect onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'PC' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('still selects an inactive option when deselection is allowed', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <Segmented options={OPTIONS} value="pc" allowDeselect onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Mobile' }))

    expect(onChange).toHaveBeenCalledWith('mobile')
  })

  it('never submits the form it sits in', () => {
    renderWithProviders(
      <Segmented options={OPTIONS} value={null} onChange={vi.fn()} />
    )

    for (const name of ['Mobile', 'PC']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'type',
        'button'
      )
    }
  })
})
