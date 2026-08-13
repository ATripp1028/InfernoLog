import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListTable } from '../ListTable'
import { COLUMNS, type ColumnId, type ColumnVisibility } from '../columns'
import type { SortSpec } from '../types'
import {
  LevelProgressStatus,
  makeListItem,
  renderWithProviders,
} from '@/utils/testUtils'

const VISIBLE: ColumnId[] = ['tier', 'attempts']

function columnState() {
  const columns = Object.fromEntries([
    ...COLUMNS.map((c) => [c.id, false]),
    ...VISIBLE.map((id) => [id, true]),
  ]) as ColumnVisibility
  return { columns, columnOrder: VISIBLE }
}

type Handlers = Pick<
  Parameters<typeof ListTable>[0],
  | 'onNavigate'
  | 'onAddToCollectionItem'
  | 'onEditRunItem'
  | 'onEditLevelItem'
  | 'onDeleteItem'
  | 'onLogItem'
  | 'onToggleSort'
  | 'onReorderColumns'
>

function render({
  items = [makeListItem()],
  sorts = [] as SortSpec[],
}: {
  items?: ReturnType<typeof makeListItem>[]
  sorts?: SortSpec[]
} = {}) {
  const handlers: Handlers = {
    onNavigate: vi.fn(),
    onAddToCollectionItem: vi.fn(),
    onEditRunItem: vi.fn(),
    onEditLevelItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onLogItem: vi.fn(),
    onToggleSort: vi.fn(),
    onReorderColumns: vi.fn(),
  }
  const { columns, columnOrder } = columnState()
  return {
    ...renderWithProviders(
      <ListTable
        items={items}
        columns={columns}
        columnOrder={columnOrder}
        allColumnDefs={COLUMNS}
        sorts={sorts}
        scale="ZERO_TO_TEN"
        datePref="ISO"
        hideTime={false}
        {...handlers}
      />
    ),
    handlers,
  }
}

// The row navigates on a single click but adds to a collection on a
// double-click, so navigation is deferred by 250ms to see which it was.
//
// Run on the real clock. Faking it here means pairing `vi.useFakeTimers` with
// `userEvent.setup({ advanceTimers })`, which deadlocks: user-event awaits its
// own scheduling between the two clicks of a dblClick, and the faked clock
// never advances to release it. 250ms of real time is cheaper than that fight
// — and matches §7's stance on the global clock.
const WINDOW_MS = 250

/** Waits out the double-click window on the real clock. */
const pastWindow = () =>
  new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 50))

describe('ListTable', () => {
  describe('click versus double-click', () => {
    it('does not navigate within the double-click window', async () => {
      const { handlers } = render()

      await userEvent.click(screen.getByText(/Level /))

      expect(handlers.onNavigate).not.toHaveBeenCalled()
    })

    it('navigates once the window passes without a second click', async () => {
      const { handlers } = render()

      await userEvent.click(screen.getByText(/Level /))

      await waitFor(() => expect(handlers.onNavigate).toHaveBeenCalledOnce())
    })

    it('adds to a collection on a double-click, and never navigates', async () => {
      const { handlers } = render()

      await userEvent.dblClick(screen.getByText(/Level /))
      await pastWindow()

      expect(handlers.onAddToCollectionItem).toHaveBeenCalled()
      expect(handlers.onNavigate).not.toHaveBeenCalled()
    })
  })

  describe('row actions', () => {
    const openKebab = async (index = 0) =>
      userEvent.click(screen.getAllByRole('button', { name: 'Row actions' })[index]!)

    it('offers logging for a level that is not yet completed', async () => {
      render({ items: [makeListItem({ status: LevelProgressStatus.IN_PROGRESS })] })

      await openKebab()

      expect(
        screen.getByRole('button', { name: /Log a completion/ })
      ).toBeInTheDocument()
    })

    it('offers no logging once the level is completed', async () => {
      // A level holds at most one completion, so there is nothing left to log.
      render({ items: [makeListItem({ status: LevelProgressStatus.COMPLETED })] })

      await openKebab()

      expect(
        screen.queryByRole('button', { name: /Log a completion/ })
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Add to a Collection/ })
      ).toBeInTheDocument()
    })

    it('reports the row the action was chosen from', async () => {
      const item = makeListItem({ status: LevelProgressStatus.IN_PROGRESS })
      const { handlers } = render({ items: [item] })

      await openKebab()
      await userEvent.click(
        screen.getByRole('button', { name: /Log a completion/ })
      )

      expect(handlers.onLogItem).toHaveBeenCalledWith(item, 'completion')
    })

    it('opens the menu for one row only', async () => {
      render({
        items: [
          makeListItem({ levelProgressId: 'a', status: LevelProgressStatus.IN_PROGRESS }),
          makeListItem({ levelProgressId: 'b', status: LevelProgressStatus.IN_PROGRESS }),
        ],
      })

      await openKebab(0)

      // Two rows, one menu. Whether clicking the *other* kebab hands the menu
      // over is Radix's outside-click dismissal rather than anything this
      // component decides, so it is not asserted here.
      expect(
        screen.getAllByRole('button', { name: /Add to a Collection/ })
      ).toHaveLength(1)
    })

    it('does not navigate when the kebab itself is clicked', async () => {
      const { handlers } = render()

      await openKebab()
      // Past the window: navigation is deferred, so asserting immediately
      // would pass even if the kebab let its click reach the row.
      await pastWindow()

      expect(handlers.onNavigate).not.toHaveBeenCalled()
    })
  })

  describe('column headers', () => {
    it('sorts by the column clicked', async () => {
      const { handlers } = render()

      await userEvent.click(screen.getByRole('button', { name: /Attempts/ }))

      expect(handlers.onToggleSort).toHaveBeenCalledWith('attempts')
    })

    it('numbers each sort by its position in the stack', () => {
      render({
        sorts: [
          { key: 'tier', dir: 'asc' },
          { key: 'attempts', dir: 'desc' },
        ],
      })

      expect(screen.getByRole('button', { name: /Tier/ })).toHaveTextContent('1')
      expect(screen.getByRole('button', { name: /Attempts/ })).toHaveTextContent(
        '2'
      )
    })

    it('marks no column when nothing is sorted', () => {
      render({ sorts: [] })

      expect(screen.getByRole('button', { name: /Tier/ })).not.toHaveTextContent(
        '1'
      )
    })

    it('renders one row per item', () => {
      render({
        items: [
          makeListItem({ levelProgressId: 'a' }),
          makeListItem({ levelProgressId: 'b' }),
          makeListItem({ levelProgressId: 'c' }),
        ],
      })

      expect(
        screen.getAllByRole('button', { name: 'Row actions' })
      ).toHaveLength(3)
    })
  })
})
