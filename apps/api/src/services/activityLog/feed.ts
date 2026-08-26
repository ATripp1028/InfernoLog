// The Log page's merged feed — the read half of the activity log.
//
// One page of activity_log events and progress_updates interleaved, newest
// first. The two tables are merged at read time rather than one being copied
// into the other: a progress log is ALREADY an event (kind + loggedAt), and
// duplicating it into activity_log would create two records of one fact that
// can drift apart. See docs/EVENT_LOG.md, "Deliberately not tracked".
//
// **RANKING_REBALANCE is excluded in the query, not styled quiet.** It is the
// one hidden event type: the order the user sees does not change and nothing
// they did is described by it. It must never reach a feed response.
//
// The order is a THREE-level total order, and keyset pagination depends on
// every level of it:
//
//   1. recorded time descending — createdAt for an event, loggedAt for a
//      progress update. Never progress_updates.date: that is when the user says
//      the run happened, is optionally uncertain, and can be back-dated.
//   2. activity_log before progress_updates on a tie. An event normally follows
//      the write that triggered it, so this reads in causal order.
//   3. within one table: `sequence` for events, `id` for progress updates.
//
// Key 3 only ever compares rows in the same table, because key 2 has already
// separated them — which is what makes a cursor whose third component is an int
// for one table and a uuid for the other sound. It is NOT optional: the
// spreadsheet import writes its progress updates in a single createMany, so a
// whole batch shares one loggedAt, and a page boundary landing inside one would
// skip or repeat rows.

import { ActivityEventType, Prisma } from '@prisma/client'
import {
  ProgressUpdateKind,
  ACTIVITY_IMPACT_PREVIEW,
  ACTIVITY_PAGE_SIZE,
  type ActivityFeedEvent,
  type ActivityFeedItem,
  type ActivityFeedProgress,
  type ActivityFeedQuery,
  type ActivityFieldCategory,
  type FeedEventType,
} from '@infernolog/core'
import prisma from '../../utils/prisma'
import { toNum } from '../../utils/decimal'

// Which table a merged row came from. 'E' sorts before 'P', which is key 2 of
// the total order — chosen so the ordering falls out of a plain ASC on the
// column rather than needing a CASE.
type FeedSource = 'E' | 'P'

interface MergedKey {
  source: FeedSource
  id: string
  ts: Date
  // The event's `sequence`; null for a progress update, whose key-3 value is
  // its uuid instead.
  seq: number | null
}

interface Cursor {
  /** ISO timestamp of the last row on the previous page. */
  t: string
  s: FeedSource
  /** `sequence` for an event, `id` for a progress update. */
  k: number | string
}

function encodeCursor(row: MergedKey): string {
  const cursor: Cursor = {
    t: row.ts.toISOString(),
    s: row.source,
    k: row.source === 'E' ? (row.seq ?? 0) : row.id,
  }
  return Buffer.from(JSON.stringify(cursor)).toString('base64')
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64').toString())
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Cursor).t === 'string' &&
      ((parsed as Cursor).s === 'E' || (parsed as Cursor).s === 'P')
    ) {
      const cursor = parsed as Cursor
      // The third key's type is decided by the source, not merely present: an
      // event's is `sequence`, a progress update's is its uuid. A hand-made
      // token pairing 'E' with a non-numeric k would otherwise reach
      // `Number(k)` and put a NaN bind parameter into the query.
      const keyOk =
        cursor.s === 'E'
          ? typeof cursor.k === 'number' && Number.isFinite(cursor.k)
          : typeof cursor.k === 'string'
      if (keyOk && !Number.isNaN(Date.parse(cursor.t))) return cursor
    }
  } catch {
    // Malformed cursor — start from the first page rather than erroring. The
    // token is opaque and client-held, so a stale one is a client bug, not a
    // request worth rejecting.
  }
  return null
}

// A branch of the UNION that must yield nothing. Cheaper to read than
// assembling the query twice for the case where a chip excludes a whole table.
const FALSE = Prisma.sql`false`

// The EDITS chip: LOG_EDIT, narrowed to saves that touched one of the given
// field categories. Keyed off `category` and never off `fieldName`, so a newly
// editable field is covered the moment it is given a category — see
// docs/EVENT_LOG.md, "Filter on category, never on fieldName".
function editsArm(categories: ActivityFieldCategory[] | undefined): Prisma.Sql {
  const edit = Prisma.sql`a."eventType" = ${ActivityEventType.LOG_EDIT}::"ActivityEventType"`
  if (!categories?.length) return edit
  return Prisma.sql`(${edit} AND EXISTS (
    SELECT 1 FROM "activity_log_field_change" f
    WHERE f."eventId" = a."id"
      AND f."category"::text IN (${Prisma.join(categories)})
  ))`
}

// The keyset predicate for one page boundary, expressed over the merged row's
// columns. Written out in full because all three keys matter: dropping the last
// clause would skip or repeat rows inside an import's single-timestamp batch.
function cursorCondition(cursor: Cursor): Prisma.Sql {
  const ts = new Date(cursor.t)
  const tail =
    cursor.s === 'E'
      ? Prisma.sql`"seq" < ${Number(cursor.k)}`
      : Prisma.sql`"id" < ${String(cursor.k)}`
  return Prisma.sql`(
    "ts" < ${ts}
    OR ("ts" = ${ts} AND "source" > ${cursor.s})
    OR ("ts" = ${ts} AND "source" = ${cursor.s} AND ${tail})
  )`
}

/**
 * One page of the merged activity feed, newest first.
 *
 * @param query - Validated filters and opaque cursor. Every filter is optional;
 * `from`/`to` bound the same recorded-time clock the ordering uses, never the
 * user-entered date.
 * @returns The page plus `nextCursor`, which is null on the last page.
 */
export async function readActivityFeed(
  userId: string,
  query: ActivityFeedQuery
): Promise<{ data: ActivityFeedItem[]; nextCursor: string | null }> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  const keyset = cursor ? cursorCondition(cursor) : null
  // An index-friendly upper bound pushed into each branch, so neither side
  // scans rows the keyset predicate would only throw away afterwards.
  const cursorTs = cursor ? new Date(cursor.t) : null

  const eventConds: Prisma.Sql[] = [
    Prisma.sql`a."userId" = ${userId}`,
    // The one hidden event type, excluded here rather than downstream.
    Prisma.sql`a."eventType" <> ${ActivityEventType.RANKING_REBALANCE}::"ActivityEventType"`,
  ]
  const progressConds: Prisma.Sql[] = [Prisma.sql`lp."userId" = ${userId}`]

  if (query.from) {
    eventConds.push(Prisma.sql`a."createdAt" >= ${query.from}`)
    progressConds.push(Prisma.sql`pu."loggedAt" >= ${query.from}`)
  }
  if (query.to) {
    eventConds.push(Prisma.sql`a."createdAt" <= ${query.to}`)
    progressConds.push(Prisma.sql`pu."loggedAt" <= ${query.to}`)
  }
  if (cursorTs) {
    eventConds.push(Prisma.sql`a."createdAt" <= ${cursorTs}`)
    progressConds.push(Prisma.sql`pu."loggedAt" <= ${cursorTs}`)
  }

  if (query.levelId) {
    // A union, not a column match: a RANKING_BULK_REPLACE has a null levelId
    // and belongs to every level its impact rows touched. Without the second
    // arm, an import that moved this level goes missing from its history.
    eventConds.push(Prisma.sql`(
      a."levelId" = ${query.levelId}
      OR EXISTS (
        SELECT 1 FROM "activity_log_level_impact" i
        WHERE i."eventId" = a."id" AND i."levelId" = ${query.levelId}
      )
    )`)
    progressConds.push(Prisma.sql`lp."levelId" = ${query.levelId}`)
  }

  // The chip filter. Each chip is one arm of an OR over the event branch,
  // except PROGRESS, which is the other table entirely — so a request that
  // names chips without PROGRESS drops the progress branch outright rather than
  // filtering it, and one that names PROGRESS alone does the same to the event
  // branch. Naming no chip is the "All" chip and adds nothing.
  const kinds = query.kind?.length ? new Set(query.kind) : null
  if (kinds) {
    const arms: Prisma.Sql[] = []
    if (kinds.has('RANKING')) {
      arms.push(
        Prisma.sql`a."eventType"::text IN (${Prisma.join([
          ActivityEventType.RANKING_PLACEMENT,
          ActivityEventType.RANKING_REORDER,
          ActivityEventType.RANKING_UNRANKED,
          ActivityEventType.RANKING_BULK_REPLACE,
        ])})`
      )
    }
    if (kinds.has('EDITS')) arms.push(editsArm(query.category))
    if (kinds.has('SETTINGS')) {
      arms.push(
        Prisma.sql`a."eventType" = ${ActivityEventType.RATING_CONFIG_CHANGE}::"ActivityEventType"`
      )
    }
    eventConds.push(
      arms.length ? Prisma.sql`(${Prisma.join(arms, ' OR ')})` : FALSE
    )
    if (!kinds.has('PROGRESS')) progressConds.push(FALSE)
  } else if (query.category?.length) {
    // A category with no chip behind it still reads as "narrow the edits",
    // which is the only thing a category can narrow.
    eventConds.push(
      Prisma.sql`(a."eventType" <> ${ActivityEventType.LOG_EDIT}::"ActivityEventType" OR ${editsArm(
        query.category
      )})`
    )
  }

  const keysetSql = keyset ? Prisma.sql`WHERE ${keyset}` : Prisma.empty

  const keys = await prisma.$queryRaw<
    Array<{ source: FeedSource; id: string; ts: Date; seq: number | null }>
  >(Prisma.sql`
    WITH merged AS (
      SELECT 'E'::text AS "source", a."id" AS "id",
             a."createdAt" AS "ts", a."sequence" AS "seq"
      FROM "activity_log" a
      WHERE ${Prisma.join(eventConds, ' AND ')}
      UNION ALL
      SELECT 'P'::text, pu."id", pu."loggedAt", NULL::int
      FROM "progress_updates" pu
      JOIN "level_progress" lp ON lp."id" = pu."levelProgressId"
      WHERE ${Prisma.join(progressConds, ' AND ')}
    )
    SELECT * FROM merged
    ${keysetSql}
    ORDER BY "ts" DESC, "source" ASC, "seq" DESC, "id" DESC
    LIMIT ${ACTIVITY_PAGE_SIZE + 1}
  `)

  const hasMore = keys.length > ACTIVITY_PAGE_SIZE
  const page = hasMore ? keys.slice(0, ACTIVITY_PAGE_SIZE) : keys
  const last = page[page.length - 1]

  const [events, progress] = await Promise.all([
    loadEvents(
      page.filter((k) => k.source === 'E').map((k) => k.id),
      query.levelId
    ),
    loadProgress(page.filter((k) => k.source === 'P').map((k) => k.id)),
  ])

  // Re-assemble in the merged order. The two hydrating queries answer "what do
  // these ids hold", not "in what order" — the order is the keyset's alone.
  const data = page
    .map((key) =>
      key.source === 'E' ? events.get(key.id) : progress.get(key.id)
    )
    .filter((item): item is ActivityFeedItem => item !== undefined)

  return {
    data,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  }
}

// Impact rows for a page's events, capped per event. A bulk replace can touch
// the whole ranking, so a page of them would otherwise carry thousands of rows
// for a UI that renders "42 levels reordered" plus a short preview. The window
// gives the cap and the true total in one round trip.
//
// When the feed is filtered to a level, that level's own row sorts to the front
// of every preview — it is the row the reader asked about, and a cap that hid
// it would make the event look unrelated to the level it was filtered by.
async function loadImpacts(eventIds: string[], levelId: string | undefined) {
  if (eventIds.length === 0) {
    return new Map<
      string,
      { rows: ActivityFeedEvent['levelImpacts']; total: number }
    >()
  }
  const pinned = levelId
    ? Prisma.sql`(i."levelId" = ${levelId}) DESC,`
    : Prisma.empty
  const rows = await prisma.$queryRaw<
    Array<{
      eventId: string
      levelId: string | null
      levelName: string | null
      role: ActivityFeedEvent['levelImpacts'][number]['role']
      positionBefore: number | null
      positionAfter: number | null
      milestoneCrossed: number | null
      total: bigint
    }>
  >(Prisma.sql`
    SELECT "eventId", "levelId", "levelName", "role",
           "positionBefore", "positionAfter", "milestoneCrossed", "total"
    FROM (
      SELECT i.*,
             ROW_NUMBER() OVER (
               PARTITION BY i."eventId"
               ORDER BY ${pinned} i."role" ASC,
                        i."positionAfter" ASC NULLS LAST
             ) AS "rn",
             COUNT(*) OVER (PARTITION BY i."eventId") AS "total"
      FROM "activity_log_level_impact" i
      WHERE i."eventId" IN (${Prisma.join(eventIds)})
    ) ranked
    WHERE "rn" <= ${ACTIVITY_IMPACT_PREVIEW}
  `)

  const byEvent = new Map<
    string,
    { rows: ActivityFeedEvent['levelImpacts']; total: number }
  >()
  for (const row of rows) {
    const bucket = byEvent.get(row.eventId) ?? {
      rows: [],
      total: Number(row.total),
    }
    bucket.rows.push({
      levelId: row.levelId,
      levelName: row.levelName,
      role: row.role,
      positionBefore: row.positionBefore,
      positionAfter: row.positionAfter,
      milestoneCrossed: row.milestoneCrossed,
    })
    byEvent.set(row.eventId, bucket)
  }
  return byEvent
}

async function loadEvents(eventIds: string[], levelId: string | undefined) {
  const items = new Map<string, ActivityFeedEvent>()
  if (eventIds.length === 0) return items

  const [rows, impacts] = await Promise.all([
    prisma.activityLog.findMany({
      where: { id: { in: eventIds } },
      select: {
        id: true,
        createdAt: true,
        sequence: true,
        eventType: true,
        levelId: true,
        level: { select: { name: true } },
        fieldChanges: {
          select: {
            fieldName: true,
            category: true,
            oldValue: true,
            newValue: true,
          },
        },
      },
    }),
    loadImpacts(eventIds, levelId),
  ])

  for (const row of rows) {
    const impact = impacts.get(row.id)
    items.set(row.id, {
      source: 'EVENT',
      id: row.id,
      recordedAt: row.createdAt,
      sequence: row.sequence,
      // The merged query already excluded RANKING_REBALANCE, so the narrowing
      // here describes what the row can hold rather than filtering it again.
      eventType: row.eventType as FeedEventType,
      levelId: row.levelId,
      levelName: row.level?.name ?? null,
      fieldChanges: row.fieldChanges,
      levelImpacts: impact?.rows ?? [],
      impactCount: impact?.total ?? 0,
    })
  }
  return items
}

async function loadProgress(updateIds: string[]) {
  const items = new Map<string, ActivityFeedProgress>()
  if (updateIds.length === 0) return items

  const rows = await prisma.progressUpdate.findMany({
    where: { id: { in: updateIds } },
    select: {
      id: true,
      loggedAt: true,
      kind: true,
      date: true,
      dateTimezone: true,
      dateUncertain: true,
      percentage: true,
      runFrom: true,
      runTo: true,
      attempts: true,
      enjoyment: true,
      levelProgress: {
        select: { levelId: true, level: { select: { name: true } } },
      },
    },
  })

  for (const row of rows) {
    items.set(row.id, {
      source: 'PROGRESS',
      id: row.id,
      recordedAt: row.loggedAt,
      // Prisma's generated enums are string-literal unions while core's
      // ProgressUpdateKind is a TS enum, so the value is looked up rather than
      // assigned across the two.
      kind: ProgressUpdateKind[row.kind],
      levelId: row.levelProgress.levelId,
      levelName: row.levelProgress.level.name,
      date: row.date,
      dateTimezone: row.dateTimezone,
      dateUncertain: row.dateUncertain,
      percentage: toNum(row.percentage),
      runFrom: row.runFrom,
      runTo: row.runTo,
      attempts: row.attempts,
      enjoyment: row.enjoyment,
    })
  }
  return items
}
