import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyableId } from '../CopyableId'
import { toast } from '@/components/generic/sonner'
import { renderWithProviders } from '@/utils/testUtils'

// The component confirms through the app's single toast channel rather than
// swapping its own label, so the toast IS the observable outcome here.
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  // jsdom implements no clipboard at all; `configurable` so each test can
  // install its own resolution.
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

describe('CopyableId', () => {
  it('copies its id to the clipboard', async () => {
    renderWithProviders(<CopyableId id="4284013" />)

    await userEvent.click(screen.getByRole('button'))

    expect(writeText).toHaveBeenCalledWith('4284013')
  })

  it('confirms with the caller’s label so the toast says which id was copied', async () => {
    renderWithProviders(<CopyableId id="4284013" label="Level ID" />)

    await userEvent.click(screen.getByRole('button'))

    expect(toast.success).toHaveBeenCalledWith('Level ID copied')
  })

  it('falls back to a generic label when the caller gives none', async () => {
    renderWithProviders(<CopyableId id="4284013" />)

    await userEvent.click(screen.getByRole('button'))

    expect(toast.success).toHaveBeenCalledWith('ID copied')
  })

  it('reports a clipboard rejection instead of claiming success', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    renderWithProviders(<CopyableId id="4284013" />)

    await userEvent.click(screen.getByRole('button'))

    expect(toast.error).toHaveBeenCalledWith('Could not copy to clipboard')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('names both the kind of id and its value for assistive tech', () => {
    renderWithProviders(<CopyableId id="4284013" label="Song ID" />)

    expect(
      screen.getByRole('button', { name: 'Copy Song ID 4284013' })
    ).toBeInTheDocument()
  })

  it('does not let the click reach a clickable ancestor', async () => {
    // The reason this component stops propagation: it is rendered inside list
    // rows that navigate on click, and copying an id must not also open the row.
    const onRowClick = vi.fn()
    renderWithProviders(
      <div onClick={onRowClick}>
        <CopyableId id="4284013" />
      </div>
    )

    await userEvent.click(screen.getByRole('button'))

    expect(writeText).toHaveBeenCalled()
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
