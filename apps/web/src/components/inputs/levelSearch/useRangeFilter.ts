// Logic for RangeFilter: which mode a range filter is in (a range, or one exact
// value), switching between them, and turning its control's changes into URL
// state.

import { useState } from 'react'
import type { Range } from '@/components/inputs/useRangeDrafts'
import type { SearchPageState } from '@/lib/levelSearchParams'
import {
  boundsPatch,
  boundsValue,
  exactModePatch,
  exactValuePatch,
  rangeModePatch,
  rangePatch,
  rangeValue,
  type BoundFilterConfig,
  type RangeFilterConfig,
  type SliderFilterConfig,
} from './rangeFilters'
import type { Bounds } from './useBoundInputs'

/** A range filter's two modes: a span of values, or exactly one. */
export type RangeMode = 'range' | 'exact'

/** The Range/Exact switch's segments. */
export const RANGE_MODES = [
  { value: 'range', label: 'Range' },
  { value: 'exact', label: 'Exact' },
] as const

/** What the filter's control reads and writes, by the kind of control. */
export type RangeFilterView =
  | {
      kind: 'slider'
      cfg: SliderFilterConfig
      value: Range
      onChange: (v: Range) => void
    }
  | {
      kind: 'bounds'
      cfg: BoundFilterConfig
      value: Bounds
      onChange: (b: Bounds) => void
    }

/**
 * State for one range filter and its Range/Exact switch.
 *
 * A slider's mode is read off the URL: exact exactly when both bounds are set
 * and equal. A slider cannot show "exact, nothing chosen yet" — its thumb always
 * sits on some value — so switching to Exact picks one at once, and anything
 * that clears the bounds (Clear all) returns it to Range. Dragging both thumbs
 * onto one value reads as exact too, which is what that range means.
 *
 * A box pair CAN be exact and empty, so its mode is kept here instead, seeded
 * from the URL, and survives Clear all as an empty Exact box.
 */
export function useRangeFilter({
  cfg,
  state,
  onChange,
}: {
  cfg: RangeFilterConfig
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
}) {
  const bounds = boundsValue(state, cfg.field)
  const exactInUrl = bounds.min !== undefined && bounds.min === bounds.max
  const [boxesExact, setBoxesExact] = useState(exactInUrl)

  const mode: RangeMode = !cfg.exact
    ? 'range'
    : cfg.kind === 'slider'
      ? exactInUrl
        ? 'exact'
        : 'range'
      : boxesExact
        ? 'exact'
        : 'range'

  function setMode(next: RangeMode) {
    if (next === mode || !cfg.exact) return
    if (cfg.kind === 'bounds') setBoxesExact(next === 'exact')
    onChange(
      next === 'exact'
        ? exactModePatch(cfg, bounds)
        : rangeModePatch(cfg, bounds)
    )
  }

  const view: RangeFilterView =
    cfg.kind === 'slider'
      ? {
          kind: 'slider',
          cfg,
          value: rangeValue(state, cfg),
          onChange: (v) =>
            onChange(
              mode === 'exact' ? exactValuePatch(cfg, v[0]) : rangePatch(cfg, v)
            ),
        }
      : {
          kind: 'bounds',
          cfg,
          value: bounds,
          onChange: (b) => onChange(boundsPatch(cfg.field, b)),
        }

  return { mode, setMode, canSwitch: cfg.exact, view }
}
