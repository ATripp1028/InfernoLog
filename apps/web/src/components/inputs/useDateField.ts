// Draft state, parsing and clamping for {@link DatePickerField}.
//
// Moved out of features/list when the Log page's date range needed the same
// control. The parsing is the part worth sharing: a date box that accepts the
// user's own format has to know which of DD/MM and MM/DD they meant, and has to
// reject Feb 30 rather than letting it wrap to Mar 2.

import { useRef, useState } from 'react'
import type { DateFormatPreference } from '@/lib/api/wireEnums'

/**
 * Parses a date string in the user's preferred format to epoch ms.
 *
 * @returns null for anything unparseable, including a date that exists as
 * digits but not as a day — callers restore the last committed value rather
 * than writing a wrapped one.
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
 * The typed-draft state one date box keeps while the user edits it.
 *
 * While a draft is open the box shows what was typed verbatim; on blur or
 * Enter it is parsed, clamped against `min`/`max`, and only then written back.
 * That is what stops a half-typed date being read as a real bound.
 *
 * @param min - Clamps a committed value; the native calendar is bounded
 * separately, by the caller passing `min`/`max` to the hidden input.
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
