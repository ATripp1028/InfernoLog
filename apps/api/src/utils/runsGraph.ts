// computeRunsGraph — pure function for the Level Page "Runs over time" chart.
//
// Converts raw progress_updates + drop events into a chronologically ordered
// array of bars the frontend renders as horizontal spans on a 0–100% axis.
//
// Drop-merge rule (drops are status transitions, not progress updates):
//   If the drop recorded a worstFail AND it differs from the prior entry's
//   `to`, emit a synthetic bar for that percentage with droppedAfter=true.
//   Otherwise flag the most recent real update's droppedAfter=true.
// See DATA_MODEL.md and the Level Page spec for the full rationale.

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
  attemptsAtDrop: number | null
  worstFail: number | null
}

export type RunsGraphEntry = {
  // null for synthetic bars emitted from a drop event with a distinct worstFail
  progressUpdateId: string | null
  kind: 'from_zero' | 'from_run' | 'completion'
  from: number
  to: number
  date: string | null
  dateUncertain: boolean
  droppedAfter: boolean
}

type Event =
  | { type: 'update'; update: ProgressUpdateForGraph; effectiveDate: Date }
  | { type: 'drop'; drop: DropForGraph; effectiveDate: Date | null }

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
 * @param progressUpdates - All progress_updates for this level_progress (any order).
 * @param drops - Drop events in history. In v1 this is zero or one element
 *   (from level_progress drop fields), but the function handles multiple drops
 *   correctly for future schema extensions.
 * @returns Entries ordered oldest→newest by effective date (date ?? loggedAt).
 */
export function computeRunsGraph(
  progressUpdates: readonly ProgressUpdateForGraph[],
  drops: readonly DropForGraph[]
): RunsGraphEntry[] {
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
    // Same millisecond: updates sort before drops so the drop correctly
    // identifies the last update that preceded it.
    return a.type === 'update' ? -1 : 1
  })

  const result: RunsGraphEntry[] = []
  // Index into `result` of the most recent REAL (non-synthetic) update entry.
  // Synthetic drop bars do not count as "progress entries" for subsequent drops.
  let lastRealIdx = -1

  for (const event of events) {
    if (event.type === 'update') {
      result.push(entryFromUpdate(event.update))
      lastRealIdx = result.length - 1
    } else {
      // Drop event — apply the drop-merge rule.
      if (lastRealIdx === -1) continue // no prior progress entries

      const prior = result[lastRealIdx]!
      const { worstFail, droppedAt } = event.drop

      if (worstFail !== null && worstFail !== prior.to) {
        // Drop has a distinct worst-fail → emit a synthetic bar for that %.
        result.push({
          progressUpdateId: null,
          kind: 'from_zero',
          from: 0,
          to: worstFail,
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

  return result
}
