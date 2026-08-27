// One level's position history in the user's classic demon list — the level page's
// rank-history panel. The user's own level page only; there is no public
// equivalent while activity_log.visibility is inert.
//
// Two kinds of movement have to be told apart, and only one of them is stored:
//
//   • DIRECT — the user moved this level. The event carries the level's own
//     impact row, and its positionBefore/positionAfter are exact.
//   • INDIRECT — the level shifted because something else was placed above or
//     below it. These have NO rows of their own, deliberately: recording the
//     cascade would turn one drag into hundreds of rows saying nothing the
//     mover's own row does not already imply (docs/RANKING_SYSTEM.md, "direct
//     events only"). They are reconstructed here.
//
// The reconstruction walks the user's demon list events in (createdAt, sequence)
// order, maintaining a map of levelId → current listIndex and applying every
// impact row. After each event the level's position is 1 + the count of indices
// ordered above it.
//
// **This is the first reader of DEMON_LIST_REBALANCE.** Index comparisons are only
// valid inside one coordinate system, and a rebalance rewrites all of them, so
// the walk has to consume those events to re-anchor the map. The one type that
// is never displayed is one that must be read. DEMON_LIST_BULK_REPLACE updates the
// map wholesale for the same reason.
//
// The map is only as complete as the impact rows it is built from, which is why
// every user's ranking starts with a baseline DEMON_LIST_REBALANCE carrying every
// placed level's index (migration 20260825120000_rank_history_baseline). Without
// that baseline the map would hold whichever handful of levels had been touched
// since event logging shipped, and a level actually sitting at #8 would
// reconstruct as #3.
//
// Where a deleted entry has left a hole, the recomputed position disagrees with
// the stored one: deleting a level's entry deletes that level's own events, so
// its moves past this one become invisible, and the deletion itself emits
// nothing. The stored value is trusted, the difference comes back as an
// UNATTRIBUTED shift — "1 level placed above" rather than a name — and the walk
// carries the correction forward so one hole is not re-reported at every later
// event.

import { ActivityEventType, Prisma } from '@prisma/client'
import {
  ACTIVITY_IMPACT_PREVIEW,
  type ActivityLevelImpact,
  type FeedEventType,
  type RankHistoryEntry,
} from '@infernolog/core'
import prisma from '../../utils/prisma'

// Every ranking event type, the hidden one included. A rebalance is never
// returned, but the walk cannot skip it: it rewrites the whole index space.
const RANKING_EVENT_TYPES = [
  ActivityEventType.DEMON_LIST_PLACEMENT,
  ActivityEventType.DEMON_LIST_REORDER,
  ActivityEventType.DEMON_LIST_REMOVED,
  ActivityEventType.DEMON_LIST_BULK_REPLACE,
  ActivityEventType.DEMON_LIST_REBALANCE,
] as const

type RankingEventType = (typeof RANKING_EVENT_TYPES)[number]

// An impact row plus the fractional index the wire shape has no use for but the
// walk is built on.
type WalkImpact = ActivityLevelImpact & { listIndex: Prisma.Decimal }

interface WalkEvent {
  id: string
  eventType: RankingEventType
  createdAt: Date
  impacts: WalkImpact[]
}

// The wire shape's subset of an impact row — the index is internal to the walk.
function toWireImpact(impact: WalkImpact): ActivityLevelImpact {
  return {
    levelId: impact.levelId,
    levelName: impact.levelName,
    role: impact.role,
    positionBefore: impact.positionBefore,
    positionAfter: impact.positionAfter,
    milestoneCrossed: impact.milestoneCrossed,
  }
}

// The ranking as the walk currently understands it: levelId → fractional index.
// #1 is the highest index, so a level's position is 1 + however many indices sit
// above its own.
type IndexMap = Map<string, Prisma.Decimal>

function positionIn(indices: IndexMap, levelId: string): number | null {
  const own = indices.get(levelId)
  if (own === undefined) return null
  let above = 0
  for (const [id, index] of indices) {
    if (id !== levelId && index.gt(own)) above += 1
  }
  return above + 1
}

// A null positionAfter is what says a level left the demon list — on an unranking,
// and for a level a bulk replace dropped. Everything else takes the real index
// the row recorded, which is the actual value the level held after the event
// rather than any kind of delta.
function applyImpacts(indices: IndexMap, impacts: WalkImpact[]): void {
  for (const impact of impacts) {
    // Null once the level has left the shared cache. Such a row stays readable
    // through levelName, but there is no key to file it under.
    if (impact.levelId === null) continue
    if (impact.positionAfter === null) indices.delete(impact.levelId)
    else indices.set(impact.levelId, impact.listIndex)
  }
}

// The impact rows a DIRECT entry shows alongside the level's own — the
// neighbours the move sat between. Capped, and ordered the way the demon list
// reads: nearest to #1 first.
function neighborsOf(
  impacts: WalkImpact[],
  levelId: string
): ActivityLevelImpact[] {
  return impacts
    .filter((r) => r.levelId !== levelId)
    .sort(
      (a, b) => (a.positionAfter ?? Infinity) - (b.positionAfter ?? Infinity)
    )
    .slice(0, ACTIVITY_IMPACT_PREVIEW)
    .map(toWireImpact)
}

// The level whose move shifted this one. Null on a list-wide rewrite, where
// every row is a MOVER and no single level is the cause.
function causeOf(
  event: WalkEvent
): { levelId: string | null; levelName: string | null } | null {
  if (event.eventType === ActivityEventType.DEMON_LIST_BULK_REPLACE) return null
  const mover = event.impacts.find((r) => r.role === 'MOVER')
  return mover ? { levelId: mover.levelId, levelName: mover.levelName } : null
}

// How many levels a list-wide rewrite touched, for "42 levels reordered".
function levelsTouchedBy(event: WalkEvent): number | null {
  return event.eventType === ActivityEventType.DEMON_LIST_BULK_REPLACE
    ? event.impacts.length
    : null
}

async function readWalkEvents(userId: string): Promise<WalkEvent[]> {
  // Every ranking event this user has, with every impact row — the map is only
  // correct if every rewrite is applied in full. The baseline rebalance and any
  // spreadsheet import carry one row per placed level, so this scales with the
  // size of the demon list times the number of list-wide rewrites rather than with
  // the number of moves.
  const rows = await prisma.activityLog.findMany({
    where: { userId, eventType: { in: [...RANKING_EVENT_TYPES] } },
    // sequence is not decoration: one request routinely writes a rebalance and
    // the placement that tripped it, and createdAt cannot separate those
    // reliably. Reading them backwards makes the map return indices from the
    // stale coordinate system.
    orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      levelImpacts: {
        select: {
          levelId: true,
          levelName: true,
          role: true,
          listIndex: true,
          positionBefore: true,
          positionAfter: true,
          milestoneCrossed: true,
        },
      },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType as RankingEventType,
    createdAt: row.createdAt,
    impacts: row.levelImpacts,
  }))
}

// The level's live position, read rather than reconstructed. The walk should
// land here; the panel header states it as a fact either way.
async function readCurrentPosition(
  userId: string,
  levelId: string
): Promise<number | null> {
  const entry = await prisma.classicDemonList.findFirst({
    where: { userId, levelProgress: { levelId } },
    select: { listIndex: true },
  })
  if (!entry) return null
  const above = await prisma.classicDemonList.count({
    where: { userId, listIndex: { gt: entry.listIndex } },
  })
  return above + 1
}

/**
 * One level's rank history for one user, newest first.
 *
 * @param levelId - GD level id. A level the user has never placed yields an
 * empty history rather than an error; the panel renders its own empty state.
 * @returns The entries plus the level's live `currentPosition`, which is null
 * when it is not currently placed.
 */
export async function readRankHistory(
  userId: string,
  levelId: string
): Promise<{ data: RankHistoryEntry[]; currentPosition: number | null }> {
  const [events, currentPosition] = await Promise.all([
    readWalkEvents(userId),
    readCurrentPosition(userId, levelId),
  ])

  const indices: IndexMap = new Map()
  // Recomputed position + drift = the position actually held. Non-zero only
  // once a deleted entry has left a hole the map cannot know about; carried
  // forward so one deletion is reported once rather than at every later event.
  let drift = 0
  const entries: RankHistoryEntry[] = []

  for (const event of events) {
    const own = event.impacts.find((r) => r.levelId === levelId)
    const isRebalance = event.eventType === ActivityEventType.DEMON_LIST_REBALANCE

    const recomputedBefore = positionIn(indices, levelId)
    applyImpacts(indices, event.impacts)
    const recomputedAfter = positionIn(indices, levelId)

    if (own) {
      // The stored value wins over the recomputed one. A disagreement is proof
      // that something moved this level without leaving an event behind, so the
      // difference comes back as a shift with no cause to name.
      const heldBefore =
        recomputedBefore === null ? null : recomputedBefore + drift
      if (
        heldBefore !== null &&
        own.positionBefore !== null &&
        own.positionBefore !== heldBefore
      ) {
        entries.push({
          id: `${event.id}:drift`,
          // The event that revealed the shift, not the one that caused it —
          // nothing records when the hole actually opened.
          recordedAt: event.createdAt,
          kind: 'UNATTRIBUTED',
          eventType: null,
          positionBefore: heldBefore,
          positionAfter: own.positionBefore,
          milestoneCrossed: null,
          cause: null,
          neighbors: [],
          levelsTouched: null,
        })
        drift += own.positionBefore - heldBefore
      }

      // Re-anchor on what the event stored, so a hole opened before it is not
      // re-reported at every event that follows.
      if (recomputedAfter !== null && own.positionAfter !== null) {
        drift = own.positionAfter - recomputedAfter
      }

      if (!isRebalance) {
        entries.push({
          id: event.id,
          recordedAt: event.createdAt,
          kind: 'DIRECT',
          eventType: event.eventType as FeedEventType,
          positionBefore: own.positionBefore,
          positionAfter: own.positionAfter,
          milestoneCrossed: own.milestoneCrossed,
          cause: null,
          neighbors: neighborsOf(event.impacts, levelId),
          levelsTouched: levelsTouchedBy(event),
        })
      }
      continue
    }

    // No row of its own. A rebalance rewrites indices but no order, so it can
    // never shift anything; and a level not in the demon list on both sides of the
    // event has no position to shift.
    if (isRebalance) continue
    if (recomputedBefore === null || recomputedAfter === null) continue
    if (recomputedBefore === recomputedAfter) continue

    entries.push({
      id: event.id,
      recordedAt: event.createdAt,
      kind: 'INDIRECT',
      eventType: event.eventType as FeedEventType,
      positionBefore: recomputedBefore + drift,
      positionAfter: recomputedAfter + drift,
      milestoneCrossed: null,
      cause: causeOf(event),
      neighbors: [],
      levelsTouched: levelsTouchedBy(event),
    })
  }

  // One last check, against the live ranking rather than against an event.
  // Deleting a level's whole entry removes that level's own events but leaves
  // its impact rows on everyone else's standing, so the map keeps counting a
  // level that is no longer there — and the deletion emits nothing of its own.
  // Every other hole is caught at the next event this level has a row on; a
  // hole opened after that event would otherwise go unreported entirely.
  const lastEvent = events[events.length - 1]
  const recomputedNow = positionIn(indices, levelId)
  if (
    lastEvent &&
    currentPosition !== null &&
    recomputedNow !== null &&
    recomputedNow + drift !== currentPosition
  ) {
    entries.push({
      id: `${lastEvent.id}:drift-current`,
      recordedAt: lastEvent.createdAt,
      kind: 'UNATTRIBUTED',
      eventType: null,
      positionBefore: recomputedNow + drift,
      positionAfter: currentPosition,
      milestoneCrossed: null,
      cause: null,
      neighbors: [],
      levelsTouched: null,
    })
  }

  // The walk runs oldest-first because the map has to be built forwards; the
  // panel reads newest-first, the same direction the feed does.
  entries.reverse()
  return { data: entries, currentPosition }
}
