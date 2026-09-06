import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Plus } from 'lucide-react'
import { MobileNav } from '../MobileNav'
import {
  useResolvedFabActions,
  type FabAction,
} from '@/context/FabActionsContext'
import { renderWithProviders } from '@/utils/testUtils'

// Boundary only: whichever action set is registered. The nav's own wiring —
// which tap opens the sheet, which fires the action — is the subject.
vi.mock('@/context/FabActionsContext', async (orig) => ({
  ...(await orig<typeof import('@/context/FabActionsContext')>()),
  useResolvedFabActions: vi.fn(),
}))

function action(overrides: Partial<FabAction> = {}): FabAction {
  return {
    key: 'log',
    label: 'Log a completion',
    icon: Plus,
    onClick: vi.fn(),
    ...overrides,
  }
}

/** Mounts the nav with one registered action set. Async: it renders `Link`. */
function render(primary: FabAction, secondaryActions: FabAction[] = []) {
  vi.mocked(useResolvedFabActions).mockReturnValue({
    primary,
    secondaryActions,
    sheetHeader: null,
  })
  return renderWithProviders(<MobileNav />, { router: true })
}

/** The FAB itself, reached by the primary action's label. */
const fab = (primary: FabAction) =>
  screen.getByRole('button', { name: primary.label })

// The FAB fires the primary action outright when a page registers a single
// action — there is nothing to put in a sheet. That is the one path where the
// primary's own disabled state has to gate the button.
describe('MobileNav — the FAB with a single action', () => {
  it('fires the action on tap', async () => {
    const user = userEvent.setup()
    const primary = action()

    await render(primary)
    await user.click(fab(primary))

    expect(primary.onClick).toHaveBeenCalled()
  })

  it('is disabled, and fires nothing, when the action is', async () => {
    const user = userEvent.setup()
    const primary = action({ disabled: true })

    await render(primary)
    const button = fab(primary)
    expect(button).toBeDisabled()
    await user.click(button)

    expect(primary.onClick).not.toHaveBeenCalled()
  })
})

// With secondary actions the button opens the sheet rather than acting, so a
// disabled primary must not close that path off — the sheet is where every
// other action lives, and the disabled one renders inert inside it.
describe('MobileNav — the FAB with a sheet', () => {
  it('stays tappable when the primary is disabled, and opens the sheet', async () => {
    const user = userEvent.setup()
    const primary = action({ disabled: true })
    const secondary = action({ key: 'drop', label: 'Drop this level' })

    await render(primary, [secondary])
    const button = fab(primary)
    expect(button).not.toBeDisabled()
    await user.click(button)

    expect(
      screen.getByRole('button', { name: secondary.label })
    ).toBeInTheDocument()
    expect(primary.onClick).not.toHaveBeenCalled()
  })

  it('renders the disabled primary as an inert row inside it', async () => {
    const user = userEvent.setup()
    const primary = action({ disabled: true })

    await render(primary, [action({ key: 'drop', label: 'Drop this level' })])
    await user.click(fab(primary))

    // Two nodes carry the label now — the FAB and the sheet row — and the row
    // is the one that must not be a button.
    const row = screen
      .getAllByText(primary.label)
      .find((el) => el.closest('[aria-disabled]'))
    expect(row).toBeTruthy()
  })
})
