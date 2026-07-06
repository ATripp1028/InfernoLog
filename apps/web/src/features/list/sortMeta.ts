import type { StaticSortKey, SortKey, SortSpec } from './types'

export const SORT_OPTIONS: { key: StaticSortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'rating', label: 'Rating' },
  { key: 'enjoyment', label: 'Enjoyment' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'tier', label: 'Tier' },
  { key: 'name', label: 'Name' },
  { key: 'creator', label: 'Creator' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'status', label: 'Status' },
  { key: 'id', label: 'ID' },
  { key: 'length', label: 'Length' },
  { key: 'songName', label: 'Song' },
  { key: 'songArtist', label: 'Song Artist' },
  { key: 'coins', label: 'Coins' },
  { key: 'gameVersion', label: 'Version' },
  { key: 'twoPlayer', label: 'Two player' },
]

// Record only covers static sort keys; dynamic cat keys are looked up via
// getSortLabel which accepts an extra list of dynamic options.
export const SORT_LABEL: Partial<Record<string, string>> = Object.fromEntries(
  SORT_OPTIONS.map((o) => [o.key, o.label])
)

// Returns the display label for any sort key, including dynamic cat keys.
export function getSortLabel(
  key: SortKey,
  dynamicOptions: { key: SortKey; label: string }[]
): string {
  const dyn = dynamicOptions.find((o) => o.key === key)
  if (dyn) return dyn.label
  return SORT_LABEL[key] ?? key
}

// Sensible default direction when a sort is first added: names read A→Z,
// everything else newest/highest first.
export function defaultDir(key: SortKey): SortSpec['dir'] {
  const ascFirst: string[] = [
    'name',
    'creator',
    'status',
    'length',
    'songName',
    'songArtist',
  ]
  return ascFirst.includes(key) ? 'asc' : 'desc'
}
