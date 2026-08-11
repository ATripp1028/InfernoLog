// Mapping filter state onto the controls that edit it, and back. Pure —
// SearchFilters renders the chips and segmented controls; this decides what
// each one reads and what a click produces.

/**
 * Toggles membership of `v` in a filter array.
 *
 * An emptied array collapses back to `undefined` so the URL stays clean —
 * `?difficulty=` with nothing after it is not the same as the filter being
 * absent, and only the absent form round-trips as "no constraint".
 */
export function toggle<T>(arr: T[] | undefined, v: T): T[] | undefined {
  const set = new Set(arr ?? [])
  if (set.has(v)) set.delete(v)
  else set.add(v)
  const out = [...set]
  return out.length ? out : undefined
}

/**
 * The three-way segmented control a nullable-boolean filter renders as.
 */
export const TRISTATE = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const

/** One of {@link TRISTATE}'s values. */
export type TriValue = (typeof TRISTATE)[number]['value']

/**
 * Which segment a nullable-boolean filter is currently on. `undefined` — the
 * filter being absent — is 'any'.
 */
export function triValue(b: boolean | undefined): TriValue {
  return b === undefined ? 'any' : b ? 'yes' : 'no'
}

/**
 * Inverse of {@link triValue}: the filter value a segment click produces.
 * 'any' clears the filter rather than setting it to `false`.
 */
export function fromTri(v: TriValue): boolean | undefined {
  return v === 'any' ? undefined : v === 'yes'
}
