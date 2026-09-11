// Logic for RangeRow: the typed-draft state its end boxes keep while the user
// edits, the commit/clamp rules that turn a draft into a value, and the
// in-flight drag a commit-on-release slider shows before its value lands.
//
// Moved out of features/log when the /search filters needed the same control.

import { useState } from 'react'

/**
 * A [min, max] inclusive range. Equal to its domain means "no constraint".
 */
export type Range = [number, number]

function sameRange(a: Range, b: Range): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/**
 * The slider and the two number boxes under it. While the user types, the
 * draft string is shown verbatim; on blur/Enter it is parsed, clamped against
 * both the domain and the opposite end, and only then written back.
 *
 * With `commitOnRelease`, dragging moves the thumbs locally and `onChange`
 * fires once when they are let go. The drag stays on screen until `value`
 * changes — the committed value arriving back through the caller — so the
 * thumbs don't snap to the old position for the frame in between.
 */
export function useRangeDrafts({
  min,
  max,
  value,
  onChange,
  parseInput,
  commitOnRelease = false,
}: {
  min: number
  max: number
  value: Range
  onChange: (v: Range) => void
  parseInput: ((text: string, end: 'min' | 'max') => number | null) | undefined
  commitOnRelease?: boolean | undefined
}) {
  const [minDraft, setMinDraft] = useState<string | null>(null)
  const [maxDraft, setMaxDraft] = useState<string | null>(null)
  // The drag in progress, and the value it started from. It is shown only while
  // `value` is still that starting value, so a committed (or any other) change
  // to `value` retires it without an effect to clear it.
  const [drag, setDrag] = useState<{ from: Range; to: Range } | null>(null)
  const shown: Range = drag && sameRange(drag.from, value) ? drag.to : value

  function slide(v: number[]) {
    const next: Range = [v[0]!, v[1]!]
    if (commitOnRelease) setDrag({ from: value, to: next })
    else onChange(next)
  }

  function release(v: number[]) {
    if (!commitOnRelease) return
    const next: Range = [v[0]!, v[1]!]
    if (sameRange(next, value)) setDrag(null)
    else onChange(next)
  }

  function commitMin(text: string) {
    setMinDraft(null)
    if (!parseInput) return
    const n = parseInput(text, 'min')
    if (n == null) return
    onChange([Math.min(Math.max(n, min), shown[1]), shown[1]])
  }

  function commitMax(text: string) {
    setMaxDraft(null)
    if (!parseInput) return
    const n = parseInput(text, 'max')
    if (n == null) return
    onChange([shown[0], Math.max(Math.min(n, max), shown[0])])
  }

  return {
    shown,
    slide,
    release,
    minDraft,
    setMinDraft,
    commitMin,
    maxDraft,
    setMaxDraft,
    commitMax,
  }
}
