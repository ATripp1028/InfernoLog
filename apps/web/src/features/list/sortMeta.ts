import type { SortKey, SortSpec } from './types'

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'rating', label: 'Rating' },
  { key: 'enjoyment', label: 'Enjoyment' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'tier', label: 'Tier' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'id', label: 'ID' },
  { key: 'length', label: 'Length' },
  { key: 'songName', label: 'Song' },
  { key: 'songArtist', label: 'Artist' },
  { key: 'coins', label: 'Coins' },
  { key: 'gameVersion', label: 'Version' },
  { key: 'twoPlayer', label: 'Two player' },
]

export const SORT_LABEL: Record<SortKey, string> = Object.fromEntries(
  SORT_OPTIONS.map((o) => [o.key, o.label])
) as Record<SortKey, string>

// Sensible default direction when a sort is first added: names read A→Z,
// everything else newest/highest first.
export function defaultDir(key: SortKey): SortSpec['dir'] {
  const ascFirst: SortKey[] = [
    'name',
    'status',
    'length',
    'songName',
    'songArtist',
  ]
  return ascFirst.includes(key) ? 'asc' : 'desc'
}
