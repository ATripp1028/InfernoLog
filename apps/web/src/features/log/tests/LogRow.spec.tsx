import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { LogRow } from '../LogRow'
import { COLUMNS, type ColumnId, type ColumnVisibility } from '../columns'
import { Device, makeListItem, renderWithProviders } from '@/utils/testUtils'

/**
 * Only `ids` visible, in that order — so a test names the columns it means.
 * Ids outside the static registry (`cat:*`) are honoured too.
 */
function only(ids: ColumnId[]) {
  const columns = Object.fromEntries([
    ...COLUMNS.map((c) => [c.id, false]),
    ...ids.map((id) => [id, true]),
  ]) as ColumnVisibility
  return { columns, columnOrder: ids }
}

const CAT_COLUMN = {
  id: 'cat:cat-1' as ColumnId,
  label: 'Gameplay',
  width: 70,
  responsiveClass: 'flex',
  defaultVisible: false,
}

function render(
  item: ReturnType<typeof makeListItem>,
  ids: ColumnId[],
  overrides: Partial<Parameters<typeof LogRow>[0]> = {}
) {
  const { columns, columnOrder } = only(ids)
  return renderWithProviders(
    <LogRow
      item={item}
      columns={columns}
      columnOrder={columnOrder}
      allColumnDefs={COLUMNS}
      scale="ZERO_TO_TEN"
      datePref="ISO"
      hideTime={false}
      minWidth={800}
      {...overrides}
    />
  )
}

describe('LogRow', () => {
  it('renders only the visible columns', () => {
    render(makeListItem(), ['attempts'])

    expect(screen.getByText('attempts')).toBeInTheDocument()
    expect(screen.queryByText('creator')).not.toBeInTheDocument()
    expect(screen.queryByText('rating')).not.toBeInTheDocument()
  })

  it('renders visible columns in the order given, not the registry order', () => {
    render(makeListItem(), ['creator', 'attempts'])

    // Document order of the two cell labels, rather than their class names —
    // §7 keeps styling out of the assertions.
    const attemptsFollowsCreator =
      screen
        .getByText('creator')
        .compareDocumentPosition(screen.getByText('attempts')) &
      Node.DOCUMENT_POSITION_FOLLOWING
    expect(attemptsFollowsCreator).toBeTruthy()
  })

  it('dashes a cell the row has no value for, rather than leaving it blank', () => {
    render(
      makeListItem({
        level: { ...makeListItem().level, creator: null },
        entry: { ...makeListItem().entry!, attempts: null },
        overallRating: null,
      }),
      ['creator', 'attempts', 'rating']
    )

    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('groups thousands in the attempt count', () => {
    render(
      makeListItem({ entry: { ...makeListItem().entry!, attempts: 42000 } }),
      ['attempts']
    )

    expect(screen.getByText('42,000')).toBeInTheDocument()
  })

  it('renders ratings on the display scale, not the internal 0–100', () => {
    render(makeListItem({ overallRating: 70 }), ['rating'])

    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('flags an uncertain date and leaves a certain one unmarked', () => {
    const entry = makeListItem().entry!
    const { unmount } = render(
      makeListItem({
        entry: {
          ...entry,
          date: new Date('2026-03-14T00:00:00.000Z'),
          dateUncertain: true,
        },
      }),
      ['date']
    )
    expect(screen.getByTitle('Uncertain date')).toBeInTheDocument()
    unmount()

    render(
      makeListItem({
        entry: {
          ...entry,
          date: new Date('2026-03-14T00:00:00.000Z'),
          dateUncertain: false,
        },
      }),
      ['date']
    )
    expect(screen.queryByTitle('Uncertain date')).not.toBeInTheDocument()
  })

  it('names the device rather than echoing its stored value', () => {
    const entry = makeListItem().entry!
    const { unmount } = render(
      makeListItem({ entry: { ...entry, device: Device.PC } }),
      ['device']
    )
    expect(screen.getByText('PC')).toBeInTheDocument()
    unmount()

    render(makeListItem({ entry: { ...entry, device: Device.MOBILE } }), [
      'device',
    ])
    expect(screen.getByText('Mobile')).toBeInTheDocument()
  })

  it('offers the level id as a copyable control, not plain text', () => {
    render(makeListItem(), ['id'])

    expect(
      screen.getByRole('button', { name: /Copy Level ID/ })
    ).toBeInTheDocument()
  })

  it('shows a weighted category score in its own column', () => {
    render(
      makeListItem({ ratingScores: [{ categoryId: 'cat-1', score: 90 }] }),
      ['cat:cat-1' as ColumnId],
      { allColumnDefs: [...COLUMNS, CAT_COLUMN] }
    )

    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('gameplay')).toBeInTheDocument()
  })

  it('dashes a category the row has no score for', () => {
    render(makeListItem({ ratingScores: [] }), ['cat:cat-1' as ColumnId], {
      allColumnDefs: [...COLUMNS, CAT_COLUMN],
    })

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
