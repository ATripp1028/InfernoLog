/**
 * The spring sheet.
 *
 * It exists because the Radix one stutters — see the module header — so what it
 * has to prove here is that dropping Radix did not cost the dismissal and
 * focus behaviour that came with it: Escape, a backdrop that closes, a named
 * dialog role, and focus returning to whatever opened it.
 */

import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/utils/testUtils'
import { MotionSheet } from '../motion-sheet'

function Harness({ side = 'right' as const }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <MotionSheet
        open={open}
        onClose={() => setOpen(false)}
        side={side}
        label="Reference"
      >
        <p>Panel body</p>
      </MotionSheet>
    </>
  )
}

describe('MotionSheet', () => {
  it('stays closed until asked', () => {
    renderWithProviders(<Harness />)
    expect(screen.queryByText('Panel body')).not.toBeInTheDocument()
  })

  it('opens as a named dialog', async () => {
    renderWithProviders(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))

    expect(
      screen.getByRole('dialog', { name: 'Reference' })
    ).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderWithProviders(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    await userEvent.keyboard('{Escape}')

    // AnimatePresence keeps the node mounted until the exit spring finishes,
    // so this waits for the removal rather than asserting on the same tick.
    await waitForElementToBeRemoved(() => screen.queryByText('Panel body'))
  })

  it('closes when the backdrop is clicked', async () => {
    renderWithProviders(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
    await userEvent.click(screen.getByLabelText('Close Reference'))

    await waitForElementToBeRemoved(() => screen.queryByText('Panel body'))
  })

  it('returns focus to whatever opened it', async () => {
    renderWithProviders(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open it' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    expect(trigger).toHaveFocus()
  })

  it('does not lock the page behind it', async () => {
    // Deliberate: locking body scroll is what relaid out the page on the frame
    // the panel started moving, which was the stutter this replaced.
    renderWithProviders(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }))

    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('takes focus itself so the keyboard lands inside the panel', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <MotionSheet open onClose={onClose} label="Reference">
        <p>Panel body</p>
      </MotionSheet>
    )

    expect(screen.getByRole('dialog', { name: 'Reference' })).toHaveFocus()
  })
})
