import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogCloseButton } from '../dialog-close-button'
import { renderWithProviders } from '@/utils/testUtils'

describe('DialogCloseButton', () => {
  it('closes the dialog when it is not disabled', async () => {
    const onClick = vi.fn()
    renderWithProviders(<DialogCloseButton onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('ignores clicks while disabled', async () => {
    // The whole point of the disabled state: a dialog mid-write must not be
    // dismissable, and this button is one of the paths that would do it.
    const onClick = vi.fn()
    renderWithProviders(<DialogCloseButton disabled onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('fades out while disabled so the blocked close is visible', () => {
    renderWithProviders(<DialogCloseButton disabled />)

    expect(screen.getByRole('button', { name: 'Close' }).className).toContain(
      'disabled:opacity-50'
    )
  })

  it('keeps the caller styles alongside its own', () => {
    // Every dialog passes its own sizing/hover tokens; cn() must merge them
    // rather than let either side replace the other.
    renderWithProviders(<DialogCloseButton className="size-9 mt-1" />)

    const button = screen.getByRole('button', { name: 'Close' })
    expect(button.className).toContain('size-9')
    expect(button.className).toContain('rounded-md')
  })

  it('never submits a form it is rendered inside', () => {
    renderWithProviders(<DialogCloseButton />)

    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute(
      'type',
      'button'
    )
  })
})
