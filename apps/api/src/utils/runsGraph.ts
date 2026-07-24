// computeRunsGraph — pure function for the Level Page "Runs over time" chart.
//
// Converts raw progress_updates + drop events into a chronologically ordered
// array of bars the frontend renders as horizontal spans on a 0–100% axis.
//
// Drop-merge rule (drops are status transitions, not progress updates):
//   If the drop recorded a worstFail AND it differs from the prior entry's
//   `to`, emit a synthetic bar for that percentage with droppedAfter=true.
//   Otherwise flag the most recent real update's droppedAfter=true.

export type ProgressUpdateForGraph = {
  id: string
  isCompletion: boolean
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  date: Date | null
  dateUncertain: boolean
  loggedAt: Date
}

export type DropForGraph = {
  droppedAt: Date | null
  worstFail: number | null
}

export type RunsGraphEntry = {
  // null for synthetic bars emitted from a drop event or worst-fail entry
  progressUpdateId: string | null
  kind: 'from_zero' | 'from_run' | 'completion' | 'worst_fail'
  from: number
  to: number
  date: string | null
  dateUncertain: boolean
  droppedAfter: boolean
}

export type WorstFailForGraph = {
  percentage: number
  date: Date | null
}

type Event =
  | { type: 'update'; update: ProgressUpdateForGraph; effectiveDate: Date }
  | { type: 'drop'; drop: DropForGraph; effectiveDate: Date | null }
  | { type: 'worst_fail'; entry: RunsGraphEntry; effectiveDate: Date }

// The effective date used to sort a progress update within the timeline.
function effectiveDateOf(u: ProgressUpdateForGraph): Date {
  return u.date ?? u.loggedAt
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}

// Build a RunsGraphEntry from a real progress update (droppedAfter defaults false).
function entryFromUpdate(u: ProgressUpdateForGraph): RunsGraphEntry {
  if (u.isCompletion) {
    return {
      progressUpdateId: u.id,
      kind: 'completion',
      from: 0,
      to: 100,
      date: toIso(u.date),
      dateUncertain: u.dateUncertain,
      droppedAfter: false,
    }
  }
  if (u.runFrom !== null && u.runTo !== null) {
    return {
      progressUpdateId: u.id,
      kind: 'from_run',
      from: u.runFrom,
      to: u.runTo,
      date: toIso(u.date),
      dateUncertain: u.dateUncertain,
      droppedAfter: false,
    }
  }
  return {
    progressUpdateId: u.id,
    kind: 'from_zero',
    from: 0,
    to: u.percentage ?? 0,
    date: toIso(u.date),
    dateUncertain: u.dateUncertain,
    droppedAfter: false,
  }
}

/**
 * Compute the runs-graph array for the Level Page timeline.
 *
 * @param progressUpdates - Non-DROP progress_updates for this level_progress
 *   (any order) — kind=DROP rows are passed separately via `drops`.
 * @param drops - Drop events in history (each a kind=DROP progress_update).
 *   A level can be dropped more than once (drop → resume → drop again), so
 *   this may hold multiple elements.
 * @param worstFail - Optional worst-fail milestone for completed levels. When
 *   `date` is set the bar is sorted chronologically; when `date` is null it is
 *   spliced immediately before the completion entry (or appended if none exists).
 * @returns Entries ordered oldest→newest by effective date (date ?? loggedAt).
 */
export function computeRunsGraph(
  progressUpdates: readonly ProgressUpdateForGraph[],
  drops: readonly DropForGraph[],
  worstFail?: WorstFailForGraph | null
): RunsGraphEntry[] {
  const worstFailEntry: RunsGraphEntry | null = worstFail
    ? {
        progressUpdateId: null,
        kind: 'worst_fail',
        from: 0,
        to: worstFail.percentage,
        date: toIso(worstFail.date),
        dateUncertain: false,
        droppedAfter: false,
      }
    : null

  // Merge updates and drops into a single event stream, then sort chronologically.
  // Updates with the same effective date sort before drops.
  const events: Event[] = [
    ...progressUpdates.map((u) => ({
      type: 'update' as const,
      update: u,
      effectiveDate: effectiveDateOf(u),
    })),
    ...drops.map((d) => ({
      type: 'drop' as const,
      drop: d,
      effectiveDate: d.droppedAt,
    })),
  ]

  // If the worst fail has a known date, include it in the chronological stream.
  if (worstFailEntry && worstFail!.date !== null) {
    events.push({
      type: 'worst_fail',
      entry: worstFailEntry,
      effectiveDate: worstFail!.date,
    })
  }

  events.sort((a, b) => {
    const aDate = a.effectiveDate
    const bDate = b.effectiveDate
    // Null dates (unknown timing) go last.
    if (aDate === null && bDate === null) {
      return a.type === 'update' ? -1 : 1
    }
    if (aDate === null) return 1
    if (bDate === null) return -1
    const diff = aDate.getTime() - bDate.getTime()
    if (diff !== 0) return diff
    // Same-date tiebreakers (in priority order):
    // 1. worst_fail sorts before a completion — it happened just before the win.
    // 2. updates sort before drops — the drop should reference the preceding update.
    const aIsCompletion = a.type === 'update' && a.update.isCompletion
    const bIsCompletion = b.type === 'update' && b.update.isCompletion
    if (a.type === 'worst_fail' && bIsCompletion) return -1
    if (b.type === 'worst_fail' && aIsCompletion) return 1
    if (a.type === 'update' && b.type !== 'update') return -1
    if (a.type !== 'update' && b.type === 'update') return 1
    return 0
  })

  const result: RunsGraphEntry[] = []
  // Index into `result` of the most recent REAL (non-synthetic) update entry.
  // Synthetic drop bars do not count as "progress entries" for subsequent drops.
  let lastRealIdx = -1

  for (const event of events) {
    if (event.type === 'update') {
      result.push(entryFromUpdate(event.update))
      lastRealIdx = result.length - 1
    } else if (event.type === 'worst_fail') {
      // Synthetic bar — does not advance lastRealIdx.
      result.push(event.entry)
    } else {
      // Drop event — apply the drop-merge rule.
      if (lastRealIdx === -1) continue // no prior progress entries

      const prior = result[lastRealIdx]!
      const { worstFail: dropWorstFail, droppedAt } = event.drop

      if (dropWorstFail !== null && dropWorstFail !== prior.to) {
        // Drop has a distinct worst-fail → emit a synthetic bar for that %.
        result.push({
          progressUpdateId: null,
          kind: 'from_zero',
          from: 0,
          to: dropWorstFail,
          date: toIso(droppedAt),
          dateUncertain: false,
          droppedAfter: true,
        })
        // The synthetic bar is now the last entry; advance lastRealIdx only for
        // REAL updates, so subsequent drops still target real progress entries.
        // (Do NOT update lastRealIdx here.)
      } else {
        // No distinct worst-fail → flag the most recent real progress entry.
        prior.droppedAfter = true
      }
    }
  }

  // If the worst fail has no date, splice it immediately before the completion.
  if (worstFailEntry && worstFail!.date === null) {
    const completionIdx = result.findIndex((e) => e.kind === 'completion')
    if (completionIdx !== -1) {
      result.splice(completionIdx, 0, worstFailEntry)
    } else {
      result.push(worstFailEntry)
    }
  }

  return result
}
