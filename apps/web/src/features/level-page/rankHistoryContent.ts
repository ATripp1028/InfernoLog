// The wording and the pure shaping behind the rank-history panel.
//
// Three kinds of entry arrive, and only the first is something the user did:
//
//   DIRECT       — they moved this level. Positions come straight off the event.
//   INDIRECT     — the level shifted because something else moved past it.
//   UNATTRIBUTED — a shift the reconstruction can prove happened but cannot
//                  name a cause for, because the entry that caused it has since
//                  been deleted and took its events with it.
//
// The internal index renormalisation never reaches here — it is not returned —
// so there is no case for it and no wording to invent.

import type { RankHistoryEntry } from '@infernolog/core'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { formatDate } from '@/lib/dateFormat'

/**
 * The line one entry leads with.
 *
 * An indirect shift names the level that caused it when the reconstruction
 * knows which one it was, and says how many levels moved when it does not — an
 * unattributed shift is "1 level placed above", never a guessed name.
 */
export function entryLabel(entry: RankHistoryEntry): string {
  if (entry.kind === 'UNATTRIBUTED') return unattributedLabel(entry)
  if (entry.kind === 'INDIRECT') return indirectLabel(entry)

  switch (entry.eventType) {
    case 'DEMON_LIST_PLACEMENT':
      return 'Placed on your demon list'
    case 'DEMON_LIST_REORDER':
      return movedUp(entry) ? 'Moved up' : 'Moved down'
    case 'DEMON_LIST_REMOVED':
      return 'Removed from your demon list'
    case 'DEMON_LIST_BULK_REPLACE':
      return 'A spreadsheet import moved it'
    default:
      return 'Moved'
  }
}

function movedUp(entry: RankHistoryEntry): boolean {
  // Lower is better: #3 is above #8. A level that left the ranking did not move
  // up, whatever the numbers say.
  if (entry.positionAfter === null) return false
  if (entry.positionBefore === null) return true
  return entry.positionAfter < entry.positionBefore
}

function levelsMoved(entry: RankHistoryEntry): number {
  if (entry.positionBefore === null || entry.positionAfter === null) return 1
  return Math.abs(entry.positionAfter - entry.positionBefore)
}

function indirectLabel(entry: RankHistoryEntry): string {
  const name = entry.cause?.levelName
  const up = movedUp(entry)
  const count = levelsMoved(entry)

  if (entry.eventType === 'DEMON_LIST_BULK_REPLACE') {
    return 'A spreadsheet import reordered your demon list'
  }
  if (!name) {
    return up
      ? `${count} level${count === 1 ? '' : 's'} left from above`
      : `${count} level${count === 1 ? '' : 's'} placed above`
  }
  if (entry.eventType === 'DEMON_LIST_REMOVED') return `${name} left from above`
  if (up) return `${name} moved below`
  return `${name} placed above`
}

function unattributedLabel(entry: RankHistoryEntry): string {
  const count = levelsMoved(entry)
  const noun = `level${count === 1 ? '' : 's'}`
  // No cause survives to name — the entry that moved past this one was deleted,
  // and its events went with it. The shift itself is still a fact.
  return movedUp(entry)
    ? `${count} ${noun} removed from above`
    : `${count} ${noun} placed above`
}

/** The date one entry is filed under — when it was recorded, not when it happened. */
export function entryDate(
  entry: RankHistoryEntry,
  datePref: DateFormatPreference
): string {
  return formatDate(new Date(entry.recordedAt), datePref)
}

/** A 1-based ranking position: `#4`, "new" before a placement, "out" after leaving. */
export function positionText(
  position: number | null,
  side: 'before' | 'after'
): string {
  if (position !== null) return `#${position}`
  return side === 'before' ? 'new' : 'out'
}

/** "Entered the top 5" / "Left the top 25", or null when nothing was crossed. */
export function milestoneText(entry: RankHistoryEntry): string | null {
  if (entry.milestoneCrossed === null) return null
  return `${movedUp(entry) ? 'Entered' : 'Left'} the top ${entry.milestoneCrossed}`
}

/** Whether this entry is something the user themselves did. */
export function isOwnMove(entry: RankHistoryEntry): boolean {
  return entry.kind === 'DIRECT'
}

/** The headline figures above the history. */
export interface RankStats {
  current: number | null
  /** The best position the history has ever recorded, and when. */
  peak: { position: number; recordedAt: string } | null
  /** Entries the user themselves caused, which is what the count refers to. */
  moveCount: number
}

/**
 * Peak and move count, over the entries plus the live position.
 *
 * History has a hard floor at the day event logging shipped, so a peak reached
 * before then is not recoverable and this reports the best it can actually see.
 */
export function rankStats(
  entries: RankHistoryEntry[],
  currentPosition: number | null
): RankStats {
  let peak: RankStats['peak'] = null
  for (const entry of entries) {
    if (entry.positionAfter === null) continue
    if (peak === null || entry.positionAfter < peak.position) {
      peak = {
        position: entry.positionAfter,
        recordedAt: String(entry.recordedAt),
      }
    }
  }
  return {
    current: currentPosition,
    peak,
    moveCount: entries.filter(isOwnMove).length,
  }
}

/** One point on the rank chart. */
export interface RankPoint {
  /** Milliseconds since the epoch, the chart's x axis. */
  time: number
  /** The position held from this point until the next, or null once unranked. */
  position: number | null
}

/**
 * The chart's series, oldest first.
 *
 * Built from `positionBefore`/`positionAfter` pairs rather than from positions
 * alone, so the very first point is where the level started rather than where
 * the first recorded event left it.
 *
 * @param entries - Newest-first, as the API returns them.
 * @param currentPosition - Appended as "now", so the line runs to the present
 * rather than stopping at the last thing that happened to it.
 */
export function rankSeries(
  entries: RankHistoryEntry[],
  currentPosition: number | null,
  now: Date = new Date()
): RankPoint[] {
  const oldestFirst = [...entries].reverse()
  const points: RankPoint[] = []

  for (const entry of oldestFirst) {
    const time = new Date(entry.recordedAt).getTime()
    if (points.length === 0 && entry.positionBefore !== null) {
      points.push({ time, position: entry.positionBefore })
    }
    points.push({ time, position: entry.positionAfter })
  }

  if (points.length > 0 && currentPosition !== null) {
    points.push({ time: now.getTime(), position: currentPosition })
  }
  return points
}
