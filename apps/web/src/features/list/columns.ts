import type { SortKey } from './types'

// The optional, toggleable columns of the columnar (desktop/tablet) layout.
// The Level column is always present and not part of this registry.
export type ColumnId =
  | 'tier'
  | 'date'
  | 'attempts'
  | 'rating'
  | 'enjoy'
  | 'status'
  | 'id'
  | 'length'
  | 'songName'
  | 'songArtist'
  | 'coins'
  | 'version'
  | 'creator'

export interface ColumnDef {
  id: ColumnId
  label: string
  width: number // px, matches the Figma column widths
  sortKey?: SortKey
  // Extra Tailwind visibility class applied to each cell.
  // All columns are visible wherever the columnar table renders (md+).
  responsiveClass: string
  // Shown by default. Extra metadata columns are opt-in.
  defaultVisible: boolean
}

export const COLUMNS: ColumnDef[] = [
  {
    id: 'tier',
    label: 'Tier',
    width: 60,
    sortKey: 'tier',
    responsiveClass: 'flex',
    defaultVisible: true,
  },
  {
    id: 'date',
    label: 'Date',
    width: 90,
    sortKey: 'date',
    responsiveClass: 'flex',
    defaultVisible: true,
  },
  {
    id: 'attempts',
    label: 'Attempts',
    width: 80,
    sortKey: 'attempts',
    responsiveClass: 'flex',
    defaultVisible: true,
  },
  {
    id: 'rating',
    label: 'Rating',
    width: 70,
    sortKey: 'rating',
    responsiveClass: 'flex',
    defaultVisible: true,
  },
  {
    id: 'enjoy',
    label: 'Enjoy',
    width: 60,
    sortKey: 'enjoyment',
    responsiveClass: 'flex',
    defaultVisible: true,
  },
  {
    id: 'status',
    label: 'Status',
    width: 90,
    responsiveClass: 'flex',
    defaultVisible: true,
  },
  // Opt-in metadata columns.
  {
    id: 'id',
    label: 'ID',
    width: 80,
    sortKey: 'id',
    responsiveClass: 'flex',
    defaultVisible: false,
  },
  {
    id: 'length',
    label: 'Length',
    width: 80,
    sortKey: 'length',
    responsiveClass: 'flex',
    defaultVisible: false,
  },
  {
    id: 'creator',
    label: 'Creator',
    width: 130,
    sortKey: 'creator',
    responsiveClass: 'flex',
    defaultVisible: false,
  },
  {
    id: 'songName',
    label: 'Song',
    width: 150,
    sortKey: 'songName',
    responsiveClass: 'flex',
    defaultVisible: false,
  },
  {
    id: 'songArtist',
    label: 'Song Artist',
    width: 130,
    sortKey: 'songArtist',
    responsiveClass: 'flex',
    defaultVisible: false,
  },
  {
    id: 'coins',
    label: 'Coins',
    width: 76,
    sortKey: 'coins',
    responsiveClass: 'flex',
    defaultVisible: false,
  },
  {
    id: 'version',
    label: 'Version',
    width: 76,
    sortKey: 'gameVersion',
    responsiveClass: 'flex',
    defaultVisible: false,
  },
]

export type ColumnVisibility = Record<ColumnId, boolean>

export function defaultColumnVisibility(): ColumnVisibility {
  return Object.fromEntries(
    COLUMNS.map((c) => [c.id, c.defaultVisible])
  ) as ColumnVisibility
}

export function defaultColumnOrder(): ColumnId[] {
  return COLUMNS.map((c) => c.id)
}
