import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepperInput } from '../stepper-input'
import { renderWithProviders } from '@/utils/testUtils'

// The arithmetic (clamping, rounding, stepping) lives in stepperValue.ts and is
// covered by stepperValue.spec.ts. What is only reachable by rendering is the
// wiring around it: when the draft is free-form, when it commits, and what the
// step buttons are allowed to do.

const field = () => screen.getByLabelText('Weight')

function render(props: Partial<Parameters<typeof StepperInput>[0]> = {}) {
  return renderWithProviders(
    <StepperInput
      value={0.5}
      onChange={vi.fn()}
      min={0}
      max={1}
      aria-label="Weight"
      {...props}
    />
  )
}

/** A controlled host, for the cases where the value has to actually move. */
function Host({ initial = 0.5 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <StepperInput
      value={value}
      onChange={setValue}
      min={0}
      max={1}
      aria-label="Weight"
    />
  )
}

describe('StepperInput', () => {
  it('shows the value at the configured precision', () => {
    render({ value: 0.5, precision: 2 })

    expect(field()).toHaveValue('0.50')
  })

  it('lets the field be emptied and retyped without reporting a change', async () => {
    const onChange = vi.fn()
    render({ onChange })

    await userEvent.clear(field())
    await userEvent.type(field(), '0.7')

    // Still mid-edit: the parent has heard nothing yet.
    expect(field()).toHaveValue('0.7')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits what was typed on blur', async () => {
    const onChange = vi.fn()
    render({ onChange })

    await userEvent.clear(field())
    await userEvent.type(field(), '0.7')
    await userEvent.tab()

    expect(onChange).toHaveBeenCalledWith(0.7)
  })

  it('commits on Enter', async () => {
    const onChange = vi.fn()
    render({ onChange })

    await userEvent.clear(field())
    await userEvent.type(field(), '0.7{Enter}')

    expect(onChange).toHaveBeenCalledWith(0.7)
  })

  it('abandons the edit on Escape', async () => {
    const onChange = vi.fn()
    render({ onChange })

    await userEvent.clear(field())
    await userEvent.type(field(), '0.7{Escape}')

    expect(field()).toHaveValue('0.50')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps a typed value into range on commit', async () => {
    const onChange = vi.fn()
    render({ onChange })

    await userEvent.clear(field())
    await userEvent.type(field(), '5{Enter}')

    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('offers each delta on both sides', () => {
    render({ deltas: [0.1, 0.01] })

    for (const name of ['+.1', '+.01', '−.1', '−.01']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('steps by the delta on the button pressed', async () => {
    const onChange = vi.fn()
    render({ value: 0.5, onChange, deltas: [0.1] })

    await userEvent.click(screen.getByRole('button', { name: '+.1' }))
    expect(onChange).toHaveBeenCalledWith(0.6)

    await userEvent.click(screen.getByRole('button', { name: '−.1' }))
    expect(onChange).toHaveBeenCalledWith(0.4)
  })

  it('blocks stepping past either bound', () => {
    const { unmount } = render({ value: 0, deltas: [0.1] })
    expect(screen.getByRole('button', { name: '−.1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '+.1' })).toBeEnabled()
    unmount()

    render({ value: 1, deltas: [0.1] })
    expect(screen.getByRole('button', { name: '+.1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '−.1' })).toBeEnabled()
  })

  it('keeps the step buttons out of the tab order, so Tab reaches the next field', () => {
    render({ deltas: [0.1] })

    for (const name of ['+.1', '−.1']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'tabindex',
        '-1'
      )
    }
  })

  it('follows the value when the parent changes it from outside', async () => {
    renderWithProviders(<Host />)

    await userEvent.click(screen.getByRole('button', { name: '+.1' }))

    expect(field()).toHaveValue('0.60')
  })
})
