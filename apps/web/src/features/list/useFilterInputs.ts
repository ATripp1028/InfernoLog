// Logic for the FilterPanel input controls (RangeRow, DatePickerField):
// the typed-draft state each keeps while the user edits, the commit/clamp
// rules that turn a draft into a filter value, and the date parsing they share.

import { useRef, useState } from 'react'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import type { Range } from '@/features/list/types'

/**
 * Parses a date string in the user's preferred format to epoch ms.
 */
export function parseFilterDate(
  text: string,
  pref: DateFormatPreference
): number | null {
  const t = text.trim()
  const sep = pref === 'ISO' ? '-' : '/'
  const parts = t.split(sep)
  if (parts.length !== 3) return null

  let y: number, m: number, d: number
  if (pref === 'ISO' || pref === 'YMD') {
    y = parseInt(parts[0]!, 10)
    m = parseInt(parts[1]!, 10) - 1
    d = parseInt(parts[2]!, 10)
  } else if (pref === 'DMY') {
    d = parseInt(parts[0]!, 10)
    m = parseInt(parts[1]!, 10) - 1
    y = parseInt(parts[2]!, 10)
  } else {
    // MDY
    m = parseInt(parts[0]!, 10) - 1
    d = parseInt(parts[1]!, 10)
    y = parseInt(parts[2]!, 10)
  }

  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  const date = new Date(y, m, d)
  // Verify no date overflow (e.g. Feb 30 wrapping to Mar 2)
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d)
    return null
  return date.getTime()
}

/**
 * Epoch ms → YYYY-MM-DD for <input type="date"> value prop.
 */
export function toIso(ms: number): string {
  const d = new Date(ms)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

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

/**
 * A single date box: typed draft, the hidden native date input it drives, and
 * the clamping applied to whichever of the two the user used.
 */
export function useDateField({
  onChange,
  datePref,
  min,
  max,
}: {
  onChange: (ms: number | null) => void
  datePref: DateFormatPreference
  min?: number | undefined
  max?: number | undefined
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const calRef = useRef<HTMLInputElement>(null)

  function clamp(ms: number): number {
    let clamped = ms
    if (min != null) clamped = Math.max(clamped, min)
    if (max != null) clamped = Math.min(clamped, max)
    return clamped
  }

  // Commit a typed value. An empty box clears the bound; anything unparseable
  // is dropped, which restores the last committed value on the next render.
  function commit(text: string) {
    setDraft(null)
    if (!text.trim()) {
      onChange(null)
      return
    }
    const n = parseFilterDate(text, datePref)
    if (n == null) return
    onChange(clamp(n))
  }

  // Commit from the native calendar, whose value is always YYYY-MM-DD.
  function commitIso(isoVal: string) {
    if (!isoVal) return
    const [y, m, d] = isoVal.split('-').map(Number)
    const ms = new Date(y!, m! - 1, d!).getTime()
    if (!isNaN(ms)) onChange(ms)
  }

  function clear() {
    setDraft(null)
    onChange(null)
  }

  function openCalendar() {
    try {
      ;(
        calRef.current as
          | (HTMLInputElement & { showPicker?: () => void })
          | null
      )?.showPicker?.()
    } catch {
      // showPicker() may throw without a user gesture or in hidden elements
    }
  }

  return { draft, setDraft, commit, commitIso, clear, calRef, openCalendar }
}
