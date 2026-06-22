import type { SortKey } from './types'

// The optional, toggleable columns of the columnar (desktop/tablet) layout.
// The Level column is always present and not part of this registry.
export type ColumnId = 'tier' | 'date' | 'attempts' | 'rating' | 'enjoy' | 'status'

export interface ColumnDef {
  id: ColumnId
  label: string
  width: number // px, matches the Figma column widths
  sortKey?: SortKey
  // Extra Tailwind visibility class. Attempts/Enjoy are desktop-only (xl);
  // the rest show wherever the columnar table renders (md+).
  responsiveClass: string
}

export const COLUMNS: ColumnDef[] = [
  { id: 'tier', label: 'Tier', width: 60, sortKey: 'tier', responsiveClass: 'flex' },
  { id: 'date', label: 'Date', width: 90, sortKey: 'date', responsiveClass: 'flex' },
  {
    id: 'attempts',
    label: 'Attempts',
    width: 80,
    sortKey: 'attempts',
    responsiveClass: 'hidden xl:flex',
  },
  { id: 'rating', label: 'Rating', width: 70, sortKey: 'rating', responsiveClass: 'flex' },
  {
    id: 'enjoy',
    label: 'Enjoy',
    width: 60,
    sortKey: 'enjoyment',
    responsiveClass: 'hidden xl:flex',
  },
  { id: 'status', label: 'Status', width: 90, responsiveClass: 'flex' },
]

export type ColumnVisibility = Record<ColumnId, boolean>

export function defaultColumnVisibility(): ColumnVisibility {
  return {
    tier: true,
    date: true,
    attempts: true,
    rating: true,
    enjoy: true,
    status: true,
  }
}
