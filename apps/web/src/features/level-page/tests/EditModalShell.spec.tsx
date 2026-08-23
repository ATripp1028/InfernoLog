import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/utils/testUtils'
import { EditModalShell } from '../EditModalShell'

function renderShell(props: Partial<Parameters<typeof EditModalShell>[0]> = {}) {
  const onClose = vi.fn()
  renderWithProviders(
    <EditModalShell
      open
      onClose={onClose}
      title="Edit run"
      subtitle="Deadlocked"
      onSave={vi.fn()}
      isSaving={false}
      saveDisabled={false}
      {...props}
    >
      <p>fields</p>
    </EditModalShell>
  )
  return { onClose }
}

describe('EditModalShell', () => {
  it('closes on Escape, the X and Cancel when idle', async () => {
    const { onClose } = renderShell()

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('refuses every dismissal path while saving', async () => {
    // A save in flight must not be orphaned: the user would be left unsure
    // whether their edit landed, with no modal left to tell them.
    const { onClose } = renderShell({ isSaving: true })

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('fades the close and cancel controls while saving', () => {
    renderShell({ isSaving: true })

    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
