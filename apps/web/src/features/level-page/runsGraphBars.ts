// How one runs-graph bar presents itself: its colours, its label, and the
// identity React keys it by. RunsGraph.tsx lays the bars out; this decides
// what each one says and looks like.
//
// Named runsGraphBars rather than runsGraph so it cannot collide with
// RunsGraph.tsx on a case-insensitive filesystem.

import type { RunsGraphEntry } from './types'

/**
 * Bar fill. A drop takes precedence over everything — it is the outcome the
 * reader is scanning for, even on the bar that also happens to be the completion.
 */
export function barColor(entry: RunsGraphEntry): string {
  if (entry.droppedAfter) return 'rgba(226,74,74,0.9)'
  if (entry.kind === 'completion') return '#22c55e'
  if (entry.kind === 'worst_fail') return 'rgba(251,146,60,0.9)'
  return 'rgba(115,115,115,0.9)'
}

/**
 * Label colour, matching {@link barColor}'s states at higher contrast for text.
 */
export function labelColor(entry: RunsGraphEntry): string {
  if (entry.droppedAfter) return '#ff8a8a'
  if (entry.kind === 'completion') return '#5ddc8a'
  if (entry.kind === 'worst_fail') return '#fb923c'
  return '#c8c8c8'
}

/**
 * What the bar says: a named outcome, or the run it covers.
 */
export function entryLabel(entry: RunsGraphEntry): string {
  if (entry.kind === 'completion') return 'Completion'
  if (entry.kind === 'worst_fail') return 'Worst fail'
  if (entry.from === 0) return `${entry.to}% from 0`
  return `run ${entry.from} → ${entry.to}%`
}

/**
 * A stable identity for a bar, independent of its current position.
 *
 * `progressUpdateId` is null for the worst-fail bar and for synthetic
 * drop-derived bars, both of which can change position when an edit shifts
 * the chronological sort. Falling back to the array index there would let
 * React reuse an unrelated bar's identity after a reorder, so synthetic drop
 * bars key on their own date instead — a level can be dropped more than once
 * at the same worst-fail percentage, but each drop still has its own
 * (possibly null) date.
 */
export function entryKey(entry: RunsGraphEntry): string {
  if (entry.progressUpdateId) return entry.progressUpdateId
  if (entry.kind === 'worst_fail') return 'worst-fail'
  return `drop-${entry.to}-${entry.date ?? 'no-date'}`
}
