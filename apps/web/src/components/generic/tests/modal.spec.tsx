import { describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../modal'
import { renderWithProviders, setViewport } from '@/utils/testUtils'

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = vi.fn()
  renderWithProviders(
    <Modal open onClose={onClose} title="Add levels" {...props}>
      <p>body</p>
    </Modal>
  )
  return { onClose }
}

describe('Modal', () => {
  it('is announced as a named dialog that hides the page behind it', () => {
    // The hand-rolled dialogs this replaced had no role, no focus trap and
    // left the page behind them fully readable to a screen reader; getting
    // that right is most of why they moved onto Radix. Radix marks the
    // siblings aria-hidden rather than setting aria-modal on the panel —
    // the better-supported of the two techniques.
    renderWithProviders(
      <div>
        <button>behind the modal</button>
        <Modal open onClose={vi.fn()} title="Add levels">
          <p>body</p>
        </Modal>
      </div>
    )

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Add levels')
    expect(
      screen.getByText('behind the modal').closest('[aria-hidden]')
    ).toHaveAttribute('aria-hidden', 'true')
  })

  it('closes on Escape and on the X when idle', async () => {
    const { onClose } = renderModal()

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('refuses Escape and the X while busy', async () => {
    const { onClose } = renderModal({ busy: true })

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  })

  it('renders one tree for both breakpoints', () => {
    // The point of branching in CSS rather than on a media query: no second
    // copy of the panel to drift, and no remount when the viewport crosses
    // the breakpoint. One header, one close button, at any width.
    setViewport('mobile')
    renderModal({ footer: <button>Save</button> })

    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
  })

  it('hands focus to the requested field on desktop', async () => {
    setViewport('desktop')
    const ref = createRef<HTMLInputElement>()
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Add levels" autoFocusRef={ref}>
        <input ref={ref} aria-label="Level" />
      </Modal>
    )

    expect(await screen.findByLabelText('Level')).toHaveFocus()
  })

  it('leaves the field alone on mobile so the keyboard stays down', async () => {
    setViewport('mobile')
    const ref = createRef<HTMLInputElement>()
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Add levels" autoFocusRef={ref}>
        <input ref={ref} aria-label="Level" />
      </Modal>
    )

    await screen.findByRole('dialog')
    expect(screen.getByLabelText('Level')).not.toHaveFocus()
  })

  it('renders nothing while closed', () => {
    renderModal({ open: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
