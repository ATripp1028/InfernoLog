import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MeData } from '@/lib/api/me'
import {
  makeMe,
  renderWithProviders,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'
import type { ProgressUpdate } from '@/lib/api/levelPage'
import { levelPageData, progressUpdate } from './fixtures'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))
vi.mock('@/lib/api/levelPage', () => ({ useEditProgress: vi.fn() }))
vi.mock('@/lib/api/logging', () => ({ useResolveLevel: vi.fn() }))
vi.mock('@/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/timezone')>()),
  getViewerTimezone: () => 'UTC',
}))

const { useMe } = await import('@/lib/api/me')
const { useEditProgress } = await import('@/lib/api/levelPage')
const { useResolveLevel } = await import('@/lib/api/logging')
const { EditEntryModal } = await import('../EditEntryModal')

beforeEach(() => {
  vi.mocked(useEditProgress).mockReturnValue(stubMutation({ mutate: vi.fn() }))
  vi.mocked(useResolveLevel).mockReturnValue(stubMutation({ mutate: vi.fn() }))
  vi.mocked(useMe).mockReturnValue(
    stubQuery<MeData>({
      data: makeMe({
        ratingMode: 'SIMPLE',
        ratingCategories: [],
        showHighlightUrl: false,
      }),
    })
  )
})

function render(updates: ProgressUpdate[]) {
  return renderWithProviders(
    <EditEntryModal
      open
      onClose={vi.fn()}
      data={levelPageData({ status: 'COMPLETED', progressUpdates: updates })}
      levelId="128"
      scale="ZERO_TO_HUNDRED"
      datePref="ISO"
    />
  )
}

const TWO_ENTRIES = [
  progressUpdate({
    progressUpdateId: 'newest',
    kind: 'COMPLETION',
    date: '2026-03-20',
  }),
  progressUpdate({
    progressUpdateId: 'older',
    kind: 'PROGRESS',
    percentage: 63,
    date: '2026-01-05',
  }),
]

describe('EditEntryModal', () => {
  it('opens on the run half of the newest entry', () => {
    render(TWO_ENTRIES)

    expect(screen.getByRole('tab', { name: /This run/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('combobox')).toHaveTextContent(
      'Completion · 2026-03-20'
    )
  })

  // The picker is the only thing between someone editing their latest run and
  // the fields — with nothing to switch to, it should not be there at all.
  it('leaves the picker out when there is only one entry', () => {
    render([TWO_ENTRIES[0]!])

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText(/editing your completion/i)).toBeInTheDocument()
  })

  it('swaps the panel when the other tab is chosen', async () => {
    const user = userEvent.setup()
    render(TWO_ENTRIES)

    await user.click(screen.getByRole('tab', { name: 'Level' }))

    expect(screen.getByLabelText('Worst fail %')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('keeps one Save for both halves', () => {
    render(TWO_ENTRIES)

    expect(
      screen.getAllByRole('button', { name: 'Save changes' })
    ).toHaveLength(1)
  })
})
