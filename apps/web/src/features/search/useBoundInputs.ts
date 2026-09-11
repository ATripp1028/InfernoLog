// Logic for BoundInputs: the two boxes an unbounded range filter is typed
// into. Empty means no limit — there is never a placeholder word to delete —
// and the line under the boxes explains the filter until something is set,
// then says what it matches.

import { useId, useState } from 'react'

/** A filter's two optional ends. Either may be absent for an open end. */
export interface Bounds {
  min: number | undefined
  max: number | undefined
}

type End = 'min' | 'max'

// What a box shows instead of the committed value. While `editing` it is the
// text as typed. After a commit it is the new value, shown until `value` moves
// off `base` — the committed value landing back through the URL — so the box
// doesn't flash the old figure in between.
interface Draft {
  text: string
  base: number | undefined
  editing: boolean
}

/**
 * State for a min/max pair of boxes. A box commits on blur or Enter: blank
 * clears that end, an unparseable entry is kept on screen and flagged rather
 * than silently thrown away, and a range typed backwards is flipped.
 */
export function useBoundInputs({
  value,
  onChange,
  parse,
  format,
  describe,
  hint,
  invalidMessage,
}: {
  value: Bounds
  onChange: (next: Bounds) => void
  parse: (text: string) => number | null
  format: (v: number) => string
  describe: (min: number | undefined, max: number | undefined) => string
  hint: string
  invalidMessage: string
}) {
  const id = useId()
  const [drafts, setDrafts] = useState<Record<End, Draft | null>>({
    min: null,
    max: null,
  })
  const [invalid, setInvalid] = useState<End | null>(null)

  // A committed draft retires the first render its value has moved off `base`
  // (the commit landing, or anything else changing it). Done during render —
  // React's pattern for adjusting state to a prop change — rather than left to
  // `text`, or a later return to `base` (Clear all, after committing into an
  // empty box) would bring the stale text back.
  const stale = (end: End) => {
    const draft = drafts[end]
    return draft !== null && !draft.editing && draft.base !== value[end]
  }
  if (stale('min') || stale('max')) {
    setDrafts((all) => ({
      min: stale('min') ? null : all.min,
      max: stale('max') ? null : all.max,
    }))
  }

  function setDraft(end: End, draft: Draft | null) {
    setDrafts((all) => ({ ...all, [end]: draft }))
  }

  function text(end: End): string {
    const draft = drafts[end]
    if (draft && (draft.editing || draft.base === value[end])) return draft.text
    const v = value[end]
    return v === undefined ? '' : format(v)
  }

  function edit(end: End, typed: string) {
    setDraft(end, { text: typed, base: value[end], editing: true })
    if (invalid === end) setInvalid(null)
  }

  function commit(end: End) {
    const draft = drafts[end]
    if (!draft?.editing) return
    const typed = draft.text.trim()
    const n = typed === '' ? undefined : parse(typed)
    if (n === null) {
      setInvalid(end)
      return
    }
    setInvalid(null)

    let next: Bounds = { ...value, [end]: n }
    if (next.min !== undefined && next.max !== undefined && next.min > next.max) {
      next = { min: next.max, max: next.min }
    }
    if (next.min === value.min && next.max === value.max) {
      setDraft(end, null)
      return
    }
    const landed = next[end]
    setDraft(end, {
      text: landed === undefined ? '' : format(landed),
      base: value[end],
      editing: false,
    })
    onChange(next)
  }

  // Escape: throw the typing away and show the committed value again.
  function revert(end: End) {
    setDraft(end, null)
    if (invalid === end) setInvalid(null)
  }

  const hasBound = value.min !== undefined || value.max !== undefined
  const tone: 'error' | 'summary' | 'hint' = invalid
    ? 'error'
    : hasBound
      ? 'summary'
      : 'hint'
  const message =
    tone === 'error'
      ? invalidMessage
      : tone === 'summary'
        ? describe(value.min, value.max)
        : hint

  return {
    ids: { min: `${id}-min`, max: `${id}-max`, message: `${id}-message` },
    text,
    edit,
    commit,
    revert,
    invalid,
    tone,
    message,
  }
}
