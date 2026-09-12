// The row's structure, not its looks: the copy button has to be a sibling of
// the row's link rather than a descendant, or it silently stops copying and
// starts navigating. That is exactly the regression this file exists to catch.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlacedRow } from '../PlacedRow'
import { toast } from '@/components/generic/sonner'
import { placed } from '@/features/demon-list/tests/fixtures'
import { renderWithProviders } from '@/utils/testUtils'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

function renderRow(overrides = {}) {
  const entry = placed({
    levelProgressId: 'p1',
    level: { inGameId: '2102122', name: 'Tidal Wave', creator: 'OniLink' },
    ...overrides,
  })
  return renderWithProviders(
    <PlacedRow rank={3} item={entry} listLabel="demon list" />,
    { router: true }
  )
}

describe('PlacedRow', () => {
  it('copies the level id without following the row', async () => {
    const { router } = await renderRow()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy Level ID 2102122' })
    )

    expect(writeText).toHaveBeenCalledWith('2102122')
    expect(toast.success).toHaveBeenCalledWith('Level ID copied')
    // The whole point: the row did not navigate.
    expect(router.state.location.pathname).toBe('/')
  })

  // A <button> inside an <a> is invalid markup and the click lands on the
  // anchor, so the copy control must never end up nested in the link.
  it('keeps the copy button outside the row’s link', async () => {
    await renderRow()

    const link = screen.getByRole('link')
    const copy = screen.getByRole('button', { name: 'Copy Level ID 2102122' })

    expect(link).not.toContainElement(copy)
  })

  // The link is named by the level alone rather than by the row's whole text.
  it('points at the viewer’s own page for the level, named by the level', async () => {
    await renderRow()

    const link = screen.getByRole('link', { name: '#3 — Tidal Wave' })

    expect(link).toHaveAttribute('href', '/log/2102122')
  })

  it('removes without following the row', async () => {
    const onRemove = vi.fn()
    const entry = placed({
      level: { inGameId: '2102122', name: 'Tidal Wave' },
    })
    const { router } = await renderWithProviders(
      <PlacedRow
        rank={3}
        item={entry}
        listLabel="demon list"
        onRemove={onRemove}
      />,
      { router: true }
    )

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Remove Tidal Wave from your demon list',
      })
    )

    expect(onRemove).toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/')
  })
})
