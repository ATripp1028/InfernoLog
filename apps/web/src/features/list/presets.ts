import type { ColumnId, ColumnVisibility } from './columns'
import { defaultColumnOrder, defaultColumnVisibility, COLUMNS } from './columns'
import { SORT_LABEL } from './sortMeta'
import {
  defaultFilterState,
  type FilterState,
  type SortSpec,
  RATING_DOMAIN,
  ENJOYMENT_DOMAIN,
  TIER_DOMAIN,
  ATTEMPTS_DOMAIN,
  DATE_MIN_MS,
} from './types'
import type { RatingDisplayScale } from '@/lib/api/me'
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
  return (
    JSON.stringify(a.statuses.slice().sort()) ===
      JSON.stringify(b.statuses.slice().sort()) &&
    JSON.stringify(a.listSources.slice().sort()) ===
      JSON.stringify(b.listSources.slice().sort()) &&
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
    // Compare dateBeaten[0] exactly, but treat dateBeaten[1] as equal if both
    // are ≥ today (i.e. neither is actually constraining the upper bound).
    a.dateBeaten[0] === b.dateBeaten[0] &&
    a.dateBeaten[1] >= Date.now() - 86_400_000 === b.dateBeaten[1] >= Date.now() - 86_400_000
  )
}

function sortsEqual(a: SortSpec[], b: SortSpec[]): boolean {
  if (a.length !== b.length) return false
  return a.every((s, i) => s.key === b[i]!.key && s.dir === b[i]!.dir)
}

function columnsEqual(a: ColumnVisibility, b: ColumnVisibility): boolean {
  return COLUMNS.every((c) => a[c.id] === b[c.id])
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
// SUMMARY HELPERS (for hover card)
// ─────────────────────────────────────────────

export function summarizeSorts(sorts: SortSpec[]): string {
  if (sorts.length === 0) return 'None'
  return sorts
    .map((s) => `${SORT_LABEL[s.key]} ${s.dir === 'asc' ? '↑' : '↓'}`)
    .join(', ')
}

export function summarizeFilters(
  filters: FilterState,
  scale: RatingDisplayScale
): string[] {
  const lines: string[] = []
  if (filters.statuses.length > 0)
    lines.push(`Status: ${filters.statuses.join(', ')}`)
  if (filters.listSources.length > 0)
    lines.push(`Lists: ${filters.listSources.join(', ')}`)
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
  if (
    filters.dateBeaten[0] !== DATE_MIN_MS ||
    filters.dateBeaten[1] < Date.now() - 86_400_000
  ) {
    const fmt = (ms: number) => new Date(ms).getFullYear().toString()
    lines.push(`Date: ${fmt(filters.dateBeaten[0])}–${fmt(filters.dateBeaten[1])}`)
  }
  return lines
}

export function summarizeColumns(
  cols: ColumnVisibility,
  order: ColumnId[]
): string {
  const visibleCount = order.filter((id) => cols[id]).length
  const defaultCols = defaultColumnVisibility()
  const added = order.filter((id) => cols[id] && !defaultCols[id])
  const removed = order.filter((id) => !cols[id] && defaultCols[id])
  const parts: string[] = []
  if (added.length > 0)
    parts.push(
      added
        .map((id) => `+${COLUMNS.find((c) => c.id === id)?.label ?? id}`)
        .join(', ')
    )
  if (removed.length > 0)
    parts.push(
      removed
        .map((id) => `−${COLUMNS.find((c) => c.id === id)?.label ?? id}`)
        .join(', ')
    )
  if (parts.length === 0) return `Default (${visibleCount})`
  return `${parts.join(', ')} (${visibleCount} total)`
}
