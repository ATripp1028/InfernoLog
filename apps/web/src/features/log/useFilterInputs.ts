// Logic for the FilterPanel's range slider: the typed-draft state its end
// boxes keep while the user edits, and the commit/clamp rules that turn a
// draft into a filter value.
//
// The date box's equivalent moved to components/inputs/useDateField when the
// Log page's range needed the same control.

import { useState } from 'react'
import type { Range } from './types'

/**
 * The two number boxes under a range slider. While the user types, the draft
 * string is shown verbatim; on blur/Enter it is parsed, clamped against both
 * the domain and the opposite end, and only then written back.
 */
export function useRangeDrafts({
  min,
  max,
  value,
  onChange,
  parseInput,
}: {
  min: number
  max: number
  value: Range
  onChange: (v: Range) => void
  parseInput: ((text: string, end: 'min' | 'max') => number | null) | undefined
}) {
  const [minDraft, setMinDraft] = useState<string | null>(null)
  const [maxDraft, setMaxDraft] = useState<string | null>(null)

  function commitMin(text: string) {
    setMinDraft(null)
    if (!parseInput) return
    const n = parseInput(text, 'min')
    if (n == null) return
    onChange([Math.min(Math.max(n, min), value[1]), value[1]])
  }

  function commitMax(text: string) {
    setMaxDraft(null)
    if (!parseInput) return
    const n = parseInput(text, 'max')
    if (n == null) return
    onChange([value[0], Math.max(Math.min(n, max), value[0])])
  }

  return { minDraft, setMinDraft, commitMin, maxDraft, setMaxDraft, commitMax }
}
