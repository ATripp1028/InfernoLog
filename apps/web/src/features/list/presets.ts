import type { ColumnId, ColumnVisibility } from './columns'
import { defaultColumnOrder, defaultColumnVisibility, COLUMNS } from './columns'
import { SORT_LABEL, getSortLabel } from './sortMeta'
import {
  defaultFilterState,
  type FilterState,
  type SortSpec,
  type SortKey,
  RATING_DOMAIN,
  ENJOYMENT_DOMAIN,
  TIER_DOMAIN,
  ATTEMPTS_DOMAIN,
} from './types'
import { isRangeActive } from './filtering'
import type { RatingDisplayScale, RatingCategory } from '@/lib/api/me'
import { formatRating } from '@/features/logging/format'

// ─────────────────────────────────────────────
// COLOR PALETTE
// ─────────────────────────────────────────────

export type PresetColorId =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'rose'
  | 'slate'

export interface PresetColor {
  id: PresetColorId
  hex: string
  label: string
}

export const PRESET_COLORS: PresetColor[] = [
  { id: 'red',     hex: '#EF4444', label: 'Red'     },
  { id: 'orange',  hex: '#F97316', label: 'Orange'  },
  { id: 'amber',   hex: '#F59E0B', label: 'Amber'   },
  { id: 'yellow',  hex: '#EAB308', label: 'Yellow'  },
  { id: 'lime',    hex: '#84CC16', label: 'Lime'    },
  { id: 'green',   hex: '#22C55E', label: 'Green'   },
  { id: 'teal',    hex: '#14B8A6', label: 'Teal'    },
  { id: 'cyan',    hex: '#06B6D4', label: 'Cyan'    },
  { id: 'sky',     hex: '#0EA5E9', label: 'Sky'     },
  { id: 'blue',    hex: '#3B82F6', label: 'Blue'    },
  { id: 'indigo',  hex: '#6366F1', label: 'Indigo'  },
  { id: 'violet',  hex: '#8B5CF6', label: 'Violet'  },
  { id: 'purple',  hex: '#A855F7', label: 'Purple'  },
  { id: 'fuchsia', hex: '#D946EF', label: 'Fuchsia' },
  { id: 'rose',    hex: '#F43F5E', label: 'Rose'    },
  { id: 'slate',   hex: '#64748B', label: 'Slate'   },
]

export function getPresetColor(id: PresetColorId): PresetColor {
  return PRESET_COLORS.find((c) => c.id === id) ?? (PRESET_COLORS[9] as PresetColor) // fallback: blue
}

// WCAG-based relative luminance → pick #000 or #fff for maximum contrast.
function linearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const r = linearize(parseInt(hex.slice(1, 3), 16) / 255)
  const g = linearize(parseInt(hex.slice(3, 5), 16) / 255)
  const b = linearize(parseInt(hex.slice(5, 7), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Returns the foreground color that achieves better contrast against the given background.
export function getContrastColor(hex: string): '#000000' | '#ffffff' {
  const L = relativeLuminance(hex)
  // Contrast ratio with white: 1.05 / (L + 0.05)
  // Contrast ratio with black: (L + 0.05) / 0.05
  // Use white when white contrast > black contrast → 1.05 / (L + 0.05) > (L + 0.05) / 0.05
  // Simplifies to L < 0.179 (approximately)
  return L < 0.25 ? '#ffffff' : '#000000'
}

// ─────────────────────────────────────────────
// STATE COMPARISON
// ─────────────────────────────────────────────

export const DEFAULT_SORTS: SortSpec[] = [{ key: 'date', dir: 'desc' }]

function rangesEqual(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function filtersEqual(a: FilterState, b: FilterState): boolean {
  // Compare categoryRatings: treat missing keys as inactive (full domain).
  const allCatIds = new Set([
    ...Object.keys(a.categoryRatings ?? {}),
    ...Object.keys(b.categoryRatings ?? {}),
  ])
  const catRatingsEqual = [...allCatIds].every((id) => {
    const aRange = (a.categoryRatings ?? {})[id] ?? RATING_DOMAIN
    const bRange = (b.categoryRatings ?? {})[id] ?? RATING_DOMAIN
    return rangesEqual(aRange, bRange)
  })

  return (
    JSON.stringify(a.statuses.slice().sort()) ===
      JSON.stringify(b.statuses.slice().sort()) &&
    JSON.stringify(a.levelTypes.slice().sort()) ===
      JSON.stringify(b.levelTypes.slice().sort()) &&
    a.ratedStatus === b.ratedStatus &&
    JSON.stringify(a.flags.slice().sort()) ===
      JSON.stringify(b.flags.slice().sort()) &&
    JSON.stringify(a.lengths.slice().sort()) ===
      JSON.stringify(b.lengths.slice().sort()) &&
    JSON.stringify(a.gameVersions.slice().sort()) ===
      JSON.stringify(b.gameVersions.slice().sort()) &&
    JSON.stringify(a.difficulties.slice().sort()) ===
      JSON.stringify(b.difficulties.slice().sort()) &&
    rangesEqual(a.rating, b.rating) &&
    rangesEqual(a.enjoyment, b.enjoyment) &&
    rangesEqual(a.tier, b.tier) &&
    rangesEqual(a.attempts, b.attempts) &&
    a.dateBeaten.from === b.dateBeaten.from &&
    a.dateBeaten.to === b.dateBeaten.to &&
    catRatingsEqual
  )
}

function sortsEqual(a: SortSpec[], b: SortSpec[]): boolean {
  if (a.length !== b.length) return false
  return a.every((s, i) => s.key === b[i]!.key && s.dir === b[i]!.dir)
}

// Compare all keys present in either record; missing keys default to false.
function columnsEqual(a: ColumnVisibility, b: ColumnVisibility): boolean {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...allKeys].every((k) => (a[k] ?? false) === (b[k] ?? false))
}

function columnOrderEqual(a: ColumnId[], b: ColumnId[]): boolean {
  if (a.length !== b.length) return false
  return a.every((id, i) => id === b[i])
}

export interface ViewConfig {
  sorts: SortSpec[]
  filters: FilterState
  columns: ColumnVisibility
  columnOrder: ColumnId[]
}

export function viewConfigsEqual(a: ViewConfig, b: ViewConfig): boolean {
  return (
    sortsEqual(a.sorts, b.sorts) &&
    filtersEqual(a.filters, b.filters) &&
    columnsEqual(a.columns, b.columns) &&
    columnOrderEqual(a.columnOrder, b.columnOrder)
  )
}

export function defaultViewConfig(): ViewConfig {
  return {
    sorts: DEFAULT_SORTS,
    filters: defaultFilterState(),
    columns: defaultColumnVisibility(),
    columnOrder: defaultColumnOrder(),
  }
}

export function isDefaultConfig(config: ViewConfig): boolean {
  return viewConfigsEqual(config, defaultViewConfig())
}

// ─────────────────────────────────────────────
// PRESET CLEANUP
// ─────────────────────────────────────────────

// Strip references to deleted rating categories from a view config, and append
// any active category columns that aren't present yet. Called when applying a
// saved preset or when the user's category list changes.
export function cleanupPresetForCategories(
  config: ViewConfig,
  activeCategoryIds: Set<string>
): ViewConfig {
  const isActiveCatKey = (k: string): boolean =>
    !k.startsWith('cat:') || activeCategoryIds.has(k.slice(4))

  const columns = Object.fromEntries(
    Object.entries(config.columns).filter(([k]) => isActiveCatKey(k))
  )
  const filteredOrder = config.columnOrder.filter(isActiveCatKey)
  // Append active cat keys missing from the order (e.g. categories added after
  // the preset was saved, or a fresh default config that predates categories).
  const activeCatKeys = [...activeCategoryIds].map((id) => `cat:${id}` as ColumnId)
  const newCatKeys = activeCatKeys.filter((k) => !filteredOrder.includes(k))
  const columnOrder = newCatKeys.length ? [...filteredOrder, ...newCatKeys] : filteredOrder

  const sorts = config.sorts.filter((s) => isActiveCatKey(s.key))
  const categoryRatings = Object.fromEntries(
    Object.entries(config.filters.categoryRatings ?? {}).filter(([k]) =>
      activeCategoryIds.has(k)
    )
  )
  return {
    ...config,
    sorts,
    columns,
    columnOrder,
    filters: { ...config.filters, categoryRatings },
  }
}

// ─────────────────────────────────────────────
// SUMMARY HELPERS (for hover card)
// ─────────────────────────────────────────────

export function summarizeSorts(
  sorts: SortSpec[],
  dynamicOptions?: { key: SortKey; label: string }[]
): string {
  if (sorts.length === 0) return 'None'
  return sorts
    .map(
      (s) =>
        `${getSortLabel(s.key, dynamicOptions ?? [])} ${s.dir === 'asc' ? '↑' : '↓'}`
    )
    .join(', ')
}

export function summarizeFilters(
  filters: FilterState,
  scale: RatingDisplayScale,
  categories?: RatingCategory[]
): string[] {
  const lines: string[] = []
  if (filters.statuses.length > 0)
    lines.push(`Status: ${filters.statuses.join(', ')}`)
  if (filters.levelTypes.length > 0)
    lines.push(`Type: ${filters.levelTypes.join(', ')}`)
  if (filters.ratedStatus !== 'ALL') lines.push(`Rated: ${filters.ratedStatus}`)
  if (filters.flags.length > 0)
    lines.push(`Flags: ${filters.flags.join(', ')}`)
  if (filters.lengths.length > 0)
    lines.push(`Length: ${filters.lengths.join(', ')}`)
  if (filters.difficulties.length > 0)
    lines.push(`Difficulty: ${filters.difficulties.join(', ')}`)
  if (filters.gameVersions.length > 0)
    lines.push(`Version: ${filters.gameVersions.join(', ')}`)
  if (!rangesEqual(filters.rating, RATING_DOMAIN))
    lines.push(
      `Rating: ${formatRating(filters.rating[0], scale)}–${formatRating(filters.rating[1], scale)}`
    )
  if (!rangesEqual(filters.enjoyment, ENJOYMENT_DOMAIN))
    lines.push(
      `Enjoy: ${formatRating(filters.enjoyment[0], scale)}–${formatRating(filters.enjoyment[1], scale)}`
    )
  if (!rangesEqual(filters.tier, TIER_DOMAIN))
    lines.push(`Tier: ${filters.tier[0]}–${filters.tier[1]}`)
  if (!rangesEqual(filters.attempts, ATTEMPTS_DOMAIN))
    lines.push(`Attempts: ${filters.attempts[0]}–${filters.attempts[1]}`)
  if (filters.dateBeaten.from != null || filters.dateBeaten.to != null) {
    const fmt = (ms: number) => new Date(ms).getFullYear().toString()
    const fromStr = filters.dateBeaten.from != null ? fmt(filters.dateBeaten.from) : 'Any'
    const toStr = filters.dateBeaten.to != null ? fmt(filters.dateBeaten.to) : 'Today'
    lines.push(`Date: ${fromStr}–${toStr}`)
  }
  // Per-category rating filters.
  for (const [catId, range] of Object.entries(filters.categoryRatings ?? {})) {
    if (!rangesEqual(range, RATING_DOMAIN)) {
      const catName =
        categories?.find((c) => c.id === catId)?.name ?? 'Category'
      lines.push(
        `${catName}: ${formatRating(range[0], scale)}–${formatRating(range[1], scale)}`
      )
    }
  }
  return lines
}

export function summarizeColumns(
  cols: ColumnVisibility,
  order: ColumnId[],
  allColumnDefs?: { id: ColumnId; label: string; defaultVisible: boolean }[]
): string {
  const visibleCount = order.filter((id) => cols[id]).length
  const defaultCols = defaultColumnVisibility()
  const added = order.filter((id) => cols[id] && !(defaultCols[id] ?? false))
  const removed = order.filter((id) => !cols[id] && (defaultCols[id] ?? false))
  const parts: string[] = []

  const findLabel = (id: ColumnId): string => {
    if (allColumnDefs) {
      const def = allColumnDefs.find((c) => c.id === id)
      if (def) return def.label
    }
    return COLUMNS.find((c) => c.id === id)?.label ?? id
  }

  if (added.length > 0)
    parts.push(added.map((id) => `+${findLabel(id)}`).join(', '))
  if (removed.length > 0)
    parts.push(removed.map((id) => `−${findLabel(id)}`).join(', '))
  if (parts.length === 0) return `Default (${visibleCount})`
  return `${parts.join(', ')} (${visibleCount} total)`
}
