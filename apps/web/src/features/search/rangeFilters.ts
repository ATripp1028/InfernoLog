// The /search page's range filters: which quantitative fields get one, the
// control each renders as, and the mapping between that control and the URL's
// optional bounds. Pure — SearchFilters renders a RangeRow (slider) or a
// BoundInputs (two boxes) per entry.
//
// Fields with a fixed, familiar scale (GDDL tier, enjoyment, game version) are
// sliders. A slider's domain is a UI choice, not a validation limit (those are
// LEVEL_RANGE_BOUNDS in core): dragging a thumb to either end removes that
// bound rather than pinning it, which is what lets the game-version slider stop
// at the newest version without excluding the next one.
//
// Unbounded fields (counts, AREDL rank, duration) get two labelled boxes
// instead: empty means no limit, and the line under them explains the filter
// until something is typed, then says what it matches.

import type { CSSProperties } from 'react'
import { LEVEL_RANGE_BOUNDS } from '@infernolog/core'
import type { Range } from '@/components/inputs/useRangeDrafts'
import { formatDuration, parseDuration } from '@/lib/levelStatFormat'
import {
  rangeMaxKey,
  rangeMinKey,
  type LevelRangeField,
  type LevelRangeFilters,
} from '@/lib/levelSearchParams'
import { formatNumber } from '@/lib/numberFormat'
import { gddlTrackGradient } from '@/lib/tierColor'
import type { Bounds } from './useBoundInputs'

/** A range filter drawn as a two-thumb slider over a fixed domain. */
export interface SliderFilterConfig {
  kind: 'slider'
  field: LevelRangeField
  label: string
  /** The slider's domain. A thumb at either edge is an open end. */
  domain: Range
  step: number
  format: (v: number) => string
  trackClassName?: string
  trackStyle?: CSSProperties
}

/** A range filter typed into two boxes, for a field with no useful ceiling. */
export interface BoundFilterConfig {
  kind: 'bounds'
  field: LevelRangeField
  label: string
  minLabel: string
  maxLabel: string
  /** Drawn inside both boxes, ahead of the text ("#" for a rank). */
  prefix?: string
  minPlaceholder: string
  maxPlaceholder: string
  inputMode: 'numeric' | 'text'
  format: (v: number) => string
  /** A typed value, or null when it is unreadable or outside what the API accepts. */
  parse: (text: string) => number | null
  invalidMessage: string
  /** How the filter works, shown while neither box is set. */
  hint: string
  /** What a set filter matches, shown once either box is. */
  describe: (min: number | undefined, max: number | undefined) => string
}

export type RangeFilterConfig = SliderFilterConfig | BoundFilterConfig

/**
 * The newest GD version the game-version slider reaches. Its top edge is open,
 * so a level from a newer version still matches; bump this when one ships so
 * that version can be bounded on its own.
 */
export const LATEST_GAME_VERSION = 2.2

/** The GDDL slider's top tier. */
export const GDDL_TIER_MAX = 40

const GDDL_TIER_DOMAIN: Range = [1, GDDL_TIER_MAX]

/**
 * A typed whole number. Thousands separators, a leading "#" and a trailing "+"
 * are tolerated, since they are what the boxes and badges display.
 *
 * @returns null for anything else, including a fraction.
 */
export function parseWholeNumber(text: string): number | null {
  const t = text.replace(/[\s,#+]/g, '')
  return /^-?\d+$/.test(t) ? Number(t) : null
}

// A parser that also refuses values the API would reject for this field, so
// the box flags them instead of the search failing with a 400.
function withinLimits(
  field: LevelRangeField,
  parse: (text: string) => number | null
) {
  const { min, max } = LEVEL_RANGE_BOUNDS[field]
  return (text: string) => {
    const n = parse(text)
    if (n === null) return null
    if ((min !== null && n < min) || (max !== null && n > max)) return null
    return n
  }
}

// "At least 10,000 downloads", "Between 1:00 and 2:30".
function describeBetween(fmt: (v: number) => string, unit: string) {
  const u = unit ? ` ${unit}` : ''
  return (min: number | undefined, max: number | undefined) => {
    if (min !== undefined && max !== undefined) {
      return min === max
        ? `Exactly ${fmt(min)}${u}`
        : `Between ${fmt(min)} and ${fmt(max)}${u}`
    }
    if (min !== undefined) return `At least ${fmt(min)}${u}`
    if (max !== undefined) return `At most ${fmt(max)}${u}`
    return ''
  }
}

/**
 * What an AREDL rank range matches, in the terms people use for the list:
 * rank 1 is the hardest, so "to #100" alone is the top 100.
 */
export function describeAredlRange(
  min: number | undefined,
  max: number | undefined
): string {
  const from = min ?? 1
  if (max === undefined) {
    return from === 1
      ? 'Every ranked level'
      : `Rank #${formatNumber(from)} and easier`
  }
  if (from === 1) return `The top ${formatNumber(max)}`
  return from === max
    ? `Rank #${formatNumber(from)} only`
    : `Ranks #${formatNumber(from)} to #${formatNumber(max)}`
}

const NO_LIMIT_HINT = 'Leave a box empty for no limit.'
const WHOLE_NUMBER_MESSAGE = 'Enter a whole number, 0 or more.'

/** The community-list filters, in panel order. The sheet tier joins them as a dropdown. */
export const COMMUNITY_RANGE_FILTERS: RangeFilterConfig[] = [
  {
    kind: 'slider',
    field: 'gddlTier',
    label: 'GDDL tier',
    domain: GDDL_TIER_DOMAIN,
    step: 1,
    format: (v) => String(v),
    trackClassName: 'bg-transparent',
    trackStyle: {
      backgroundImage: gddlTrackGradient(
        GDDL_TIER_DOMAIN[0],
        GDDL_TIER_DOMAIN[1]
      ),
    },
  },
  {
    kind: 'slider',
    field: 'enjoyment',
    label: 'Enjoyment',
    domain: [0, 100],
    step: 1,
    format: (v) => String(v),
  },
  {
    kind: 'bounds',
    field: 'aredlRank',
    label: 'AREDL rank',
    minLabel: 'From rank',
    maxLabel: 'To rank',
    prefix: '#',
    minPlaceholder: '1',
    maxPlaceholder: 'No limit',
    inputMode: 'numeric',
    format: formatNumber,
    parse: withinLimits('aredlRank', parseWholeNumber),
    invalidMessage: 'Enter a rank of 1 or more, like 100.',
    hint: '#1 is the hardest level on the list. Fill in only “To rank” for a top N. Legacy levels have no rank.',
    describe: describeAredlRange,
  },
]

/** The level-stat filters, in panel order. */
export const STAT_RANGE_FILTERS: RangeFilterConfig[] = [
  {
    kind: 'bounds',
    field: 'duration',
    label: 'Duration',
    minLabel: 'At least',
    maxLabel: 'At most',
    minPlaceholder: '0:00',
    maxPlaceholder: 'No limit',
    // Numeric keypads have no colon.
    inputMode: 'text',
    format: (v) => formatDuration(v) ?? String(v),
    parse: withinLimits('duration', parseDuration),
    invalidMessage: 'Enter a time like 1:30, or seconds like 90.',
    hint: 'Minutes and seconds, like 2:30. Levels with no known duration never match.',
    describe: describeBetween((v) => formatDuration(v) ?? String(v), ''),
  },
  {
    kind: 'bounds',
    field: 'downloads',
    label: 'Downloads',
    minLabel: 'At least',
    maxLabel: 'At most',
    minPlaceholder: '0',
    maxPlaceholder: 'No limit',
    inputMode: 'numeric',
    format: formatNumber,
    parse: withinLimits('downloads', parseWholeNumber),
    invalidMessage: WHOLE_NUMBER_MESSAGE,
    hint: NO_LIMIT_HINT,
    describe: describeBetween(formatNumber, 'downloads'),
  },
  {
    kind: 'bounds',
    field: 'likes',
    label: 'Likes',
    minLabel: 'At least',
    maxLabel: 'At most',
    minPlaceholder: 'No limit',
    maxPlaceholder: 'No limit',
    // Numeric keypads have no minus sign, and likes go negative.
    inputMode: 'text',
    format: formatNumber,
    parse: withinLimits('likes', parseWholeNumber),
    invalidMessage: 'Enter a whole number.',
    hint: 'Net of dislikes, so it can go below zero. Leave a box empty for no limit.',
    describe: describeBetween(formatNumber, 'likes'),
  },
  {
    kind: 'bounds',
    field: 'objectCount',
    label: 'Object count',
    minLabel: 'At least',
    maxLabel: 'At most',
    minPlaceholder: '0',
    maxPlaceholder: 'No limit',
    inputMode: 'numeric',
    format: formatNumber,
    parse: withinLimits('objectCount', parseWholeNumber),
    invalidMessage: WHOLE_NUMBER_MESSAGE,
    hint: NO_LIMIT_HINT,
    describe: describeBetween(formatNumber, 'objects'),
  },
  {
    kind: 'slider',
    field: 'gameVersion',
    label: 'Game version',
    domain: [1, LATEST_GAME_VERSION],
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
]

/** Every range filter. */
export const RANGE_FILTERS: RangeFilterConfig[] = [
  ...COMMUNITY_RANGE_FILTERS,
  ...STAT_RANGE_FILTERS,
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
 * A slider's [min, max] for the current state: an absent bound sits at its
 * domain edge, and a bound outside the domain (valid for the API, beyond what
 * the slider shows) is drawn at the edge it passed.
 */
export function rangeValue(
  state: LevelRangeFilters,
  cfg: SliderFilterConfig
): Range {
  const min = state[rangeMinKey(cfg.field)]
  const max = state[rangeMaxKey(cfg.field)]
  return [
    min === undefined ? cfg.domain[0] : clamp(min, cfg.domain),
    max === undefined ? cfg.domain[1] : clamp(max, cfg.domain),
  ]
}

/**
 * The state patch for a slider's new [min, max]. An end at its domain edge is
 * written as `undefined`, removing that bound; anything inside is snapped to
 * the step.
 */
export function rangePatch(
  cfg: SliderFilterConfig,
  [lo, hi]: Range
): LevelRangeFilters {
  const patch: LevelRangeFilters = {}
  patch[rangeMinKey(cfg.field)] =
    lo <= cfg.domain[0] ? undefined : snap(lo, cfg.step)
  patch[rangeMaxKey(cfg.field)] =
    hi >= cfg.domain[1] ? undefined : snap(hi, cfg.step)
  return patch
}

/** A box pair's two ends, read straight from the state. */
export function boundsValue(
  state: LevelRangeFilters,
  field: LevelRangeField
): Bounds {
  return { min: state[rangeMinKey(field)], max: state[rangeMaxKey(field)] }
}

/** The state patch for a box pair's new ends; an absent end clears its bound. */
export function boundsPatch(
  field: LevelRangeField,
  { min, max }: Bounds
): LevelRangeFilters {
  const patch: LevelRangeFilters = {}
  patch[rangeMinKey(field)] = min
  patch[rangeMaxKey(field)] = max
  return patch
}
