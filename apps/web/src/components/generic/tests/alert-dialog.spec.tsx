import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlertDialog } from '../alert-dialog'
import { renderWithProviders, setViewport } from '@/utils/testUtils'

function renderConfirm(props: Partial<Parameters<typeof AlertDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  const view = renderWithProviders(
    <AlertDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this level?"
      description="This can't be undone."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      {...props}
    />
  )
  return { onConfirm, onOpenChange, ...view }
}

describe('AlertDialog', () => {
  it('asks the question and reports the answer', async () => {
    const { onConfirm } = renderConfirm()

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      "This can't be undone."
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('leaves itself open on confirm so a failed mutation can report', async () => {
    // The caller closes it, normally on success. If this component closed
    // itself the error toast would land on a dialog that had already gone.
    const { onConfirm, onOpenChange } = renderConfirm()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('seals itself while the confirmed mutation is in flight', async () => {
    const { onConfirm, onOpenChange } = renderConfirm({ isPending: true })

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('cancels through onOpenChange', async () => {
    const { onOpenChange } = renderConfirm()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  describe('with a confirmation phrase', () => {
    const phrase = 'Delete this account'

    it('holds confirm shut until the phrase matches exactly', async () => {
      renderConfirm({ confirmPhrase: phrase })
      const confirm = screen.getByRole('button', { name: 'Delete' })
      const field = screen.getByLabelText(/to confirm/)

      expect(confirm).toBeDisabled()

      await userEvent.type(field, 'delete this account')
      expect(confirm).toBeDisabled()

      await userEvent.clear(field)
      await userEvent.type(field, phrase)
      expect(confirm).toBeEnabled()
    })

    it('asks again after being closed and reopened', async () => {
      // A phrase left in the field would let the next open confirm on one
      // click — which is the whole thing the phrase exists to prevent.
      const { rerender } = renderConfirm({ confirmPhrase: phrase })
      await userEvent.type(screen.getByLabelText(/to confirm/), phrase)
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()

      rerender(
        <AlertDialog
          open={false}
          onOpenChange={vi.fn()}
          title="Delete this level?"
          confirmLabel="Delete"
          confirmPhrase={phrase}
          onConfirm={vi.fn()}
        />
      )
      rerender(
        <AlertDialog
          open
          onOpenChange={vi.fn()}
          title="Delete this level?"
          confirmLabel="Delete"
          confirmPhrase={phrase}
          onConfirm={vi.fn()}
        />
      )

      expect(screen.getByLabelText(/to confirm/)).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    })

    it('focuses the field on desktop', async () => {
      setViewport('desktop')
      renderConfirm({ confirmPhrase: phrase })

      expect(await screen.findByLabelText(/to confirm/)).toHaveFocus()
    })

    it('is absent entirely when no phrase is required', () => {
      renderConfirm()

      expect(screen.queryByLabelText(/to confirm/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    })
  })
})
