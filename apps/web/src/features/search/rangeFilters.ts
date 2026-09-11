// The /search page's range filters: which quantitative fields get one, the
// control each renders as, and the mapping between a control's [min, max] and
// the URL's optional bounds. Pure — SearchFilters renders a RangeRow per entry.
//
// A control's domain is a UI choice, not a validation limit (those are
// LEVEL_RANGE_BOUNDS in core). Either edge of it means "open": dragging a thumb
// to the end, or clearing a box, removes that bound from the URL rather than
// pinning it to the edge value. That is what lets the GDDL slider stop at 35
// without excluding a future tier 36, and the game-version slider stop at the
// newest version without excluding the next one.

import type { CSSProperties } from 'react'
import type { Range } from '@/components/inputs/useRangeDrafts'
import { formatDuration, parseDuration } from '@/lib/duration'
import {
  rangeMaxKey,
  rangeMinKey,
  type LevelRangeField,
  type LevelRangeFilters,
} from '@/lib/levelSearchParams'
import { formatNumber } from '@/lib/numberFormat'
import { MAX_SHEET_TIER, sheetTierName } from '@/lib/sheetTier'
import { gddlTrackGradient } from '@/lib/tierColor'

type End = 'min' | 'max'

/**
 * How one range filter renders and reads back.
 */
export interface RangeFilterConfig {
  field: LevelRangeField
  label: string
  /** The control's domain. A bound at either edge is an open end. */
  domain: Range
  step: number
  /** False for unbounded fields (counts, ranks, durations): no slider spans them usefully, so they get only the two boxes. */
  slider: boolean
  format: (v: number, end: End) => string
  /** Present when the ends are typeable. */
  parseInput?: (text: string, end: End) => number | null
  trackClassName?: string
  trackStyle?: CSSProperties
}

/**
 * The newest GD version the game-version slider reaches. Its top edge is open,
 * so a level from a newer version still matches; bump this when one ships so
 * that version can be bounded on its own.
 */
export const LATEST_GAME_VERSION = 2.2

const UNBOUNDED_COUNT: Range = [0, Number.POSITIVE_INFINITY]
const STARS_DOMAIN: Range = [0, 10]
const GDDL_TIER_DOMAIN: Range = [1, 35]
const AREDL_RANK_DOMAIN: Range = [1, Number.POSITIVE_INFINITY]
const ENJOYMENT_DOMAIN: Range = [0, 100]
const LIKES_DOMAIN: Range = [
  Number.NEGATIVE_INFINITY,
  Number.POSITIVE_INFINITY,
]

function isOpen(v: number, end: End, domain: Range): boolean {
  return end === 'min' ? v <= domain[0] : v >= domain[1]
}

// A box that reads "Any" while its end is open.
function openFormat(domain: Range, fmt: (v: number) => string) {
  return (v: number, end: End) => (isOpen(v, end, domain) ? 'Any' : fmt(v))
}

// A box where blank or "Any" opens that end; anything else goes to `parse`.
function openParse(domain: Range, parse: (text: string) => number | null) {
  return (text: string, end: End) => {
    const t = text.trim()
    if (t === '' || t.toLowerCase() === 'any') {
      return end === 'min' ? domain[0] : domain[1]
    }
    return parse(t)
  }
}

/**
 * A typed whole number. Thousands separators, a leading "#" (as the AREDL box
 * shows ranks) and a trailing "+" are tolerated, since they are what the boxes
 * display.
 *
 * @returns null for anything else, including a fraction.
 */
export function parseWholeNumber(text: string): number | null {
  const t = text.replace(/[\s,#+]/g, '')
  return /^-?\d+$/.test(t) ? Number(t) : null
}

/**
 * A typed number rounded to a whole one — for enjoyment, which is stored to two
 * decimals but filtered in whole points like the slider it sits under.
 */
export function parseRounded(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * Every /search range filter, in panel order: difficulty-ish figures first,
 * then the level's stats.
 */
export const RANGE_FILTERS: RangeFilterConfig[] = [
  {
    field: 'stars',
    label: 'Stars',
    domain: STARS_DOMAIN,
    step: 1,
    slider: true,
    format: (v) => String(v),
    parseInput: openParse(STARS_DOMAIN, parseWholeNumber),
  },
  {
    field: 'gddlTier',
    label: 'GDDL tier',
    domain: GDDL_TIER_DOMAIN,
    step: 1,
    slider: true,
    format: (v) => String(v),
    parseInput: openParse(GDDL_TIER_DOMAIN, parseWholeNumber),
    trackClassName: 'bg-transparent',
    trackStyle: {
      backgroundImage: gddlTrackGradient(
        GDDL_TIER_DOMAIN[0],
        GDDL_TIER_DOMAIN[1]
      ),
    },
  },
  {
    field: 'aredlRank',
    label: 'AREDL rank',
    domain: AREDL_RANK_DOMAIN,
    step: 1,
    slider: false,
    format: openFormat(AREDL_RANK_DOMAIN, (v) => `#${formatNumber(v)}`),
    parseInput: openParse(AREDL_RANK_DOMAIN, parseWholeNumber),
  },
  {
    field: 'sheetTier',
    label: 'Sheet tier',
    domain: [0, MAX_SHEET_TIER],
    step: 1,
    slider: true,
    format: (v) => `${sheetTierName(v) ?? v} (${v})`,
  },
  {
    field: 'enjoyment',
    label: 'Enjoyment',
    domain: ENJOYMENT_DOMAIN,
    step: 1,
    slider: true,
    format: (v) => String(v),
    parseInput: openParse(ENJOYMENT_DOMAIN, parseRounded),
  },
  {
    field: 'duration',
    label: 'Duration (m:ss)',
    domain: UNBOUNDED_COUNT,
    step: 1,
    slider: false,
    format: openFormat(UNBOUNDED_COUNT, (v) => formatDuration(v) ?? String(v)),
    parseInput: openParse(UNBOUNDED_COUNT, parseDuration),
  },
  {
    field: 'downloads',
    label: 'Downloads',
    domain: UNBOUNDED_COUNT,
    step: 1,
    slider: false,
    format: openFormat(UNBOUNDED_COUNT, formatNumber),
    parseInput: openParse(UNBOUNDED_COUNT, parseWholeNumber),
  },
  {
    field: 'likes',
    label: 'Likes',
    domain: LIKES_DOMAIN,
    step: 1,
    slider: false,
    format: openFormat(LIKES_DOMAIN, formatNumber),
    parseInput: openParse(LIKES_DOMAIN, parseWholeNumber),
  },
  {
    field: 'objectCount',
    label: 'Object count',
    domain: UNBOUNDED_COUNT,
    step: 1,
    slider: false,
    format: openFormat(UNBOUNDED_COUNT, formatNumber),
    parseInput: openParse(UNBOUNDED_COUNT, parseWholeNumber),
  },
  {
    field: 'gameVersion',
    label: 'Game version',
    domain: [1, LATEST_GAME_VERSION],
    step: 0.1,
    slider: true,
    format: (v) => v.toFixed(1),
  },
]

function clamp(v: number, [lo, hi]: Range): number {
  return Math.min(Math.max(v, lo), hi)
}

// Radix steps in floating point (1.0 + 0.1 × 3 is 1.3000000000000003), so a
// value is snapped to the step's own precision before it reaches the URL.
function snap(v: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number((Math.round(v / step) * step).toFixed(decimals))
}

/**
 * The control's [min, max] for the current state: an absent bound sits at its
 * domain edge, and a bound outside the domain (valid for the API, beyond what
 * the slider shows) is drawn at the edge it passed.
 */
export function rangeValue(
  state: LevelRangeFilters,
  cfg: RangeFilterConfig
): Range {
  const min = state[rangeMinKey(cfg.field)]
  const max = state[rangeMaxKey(cfg.field)]
  return [
    min === undefined ? cfg.domain[0] : clamp(min, cfg.domain),
    max === undefined ? cfg.domain[1] : clamp(max, cfg.domain),
  ]
}

/**
 * The state patch for a control's new [min, max]. An end at its domain edge is
 * written as `undefined`, removing that bound; anything inside is snapped to
 * the step.
 */
export function rangePatch(
  cfg: RangeFilterConfig,
  [lo, hi]: Range
): LevelRangeFilters {
  const patch: LevelRangeFilters = {}
  patch[rangeMinKey(cfg.field)] = isOpen(lo, 'min', cfg.domain)
    ? undefined
    : snap(lo, cfg.step)
  patch[rangeMaxKey(cfg.field)] = isOpen(hi, 'max', cfg.domain)
    ? undefined
    : snap(hi, cfg.step)
  return patch
}
