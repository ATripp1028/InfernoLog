// Event emission — the write half of the activity log.
//
// Nothing here is an endpoint. Every function is called from inside the
// transaction of the mutation it describes (demon list placement/reorder/unranking
// and the rebalances, the progress-edit save, the rating-config save), so an
// event is committed with the change it records or not at all. That coupling is
// the point: a rolled-back write must not leave an event behind, and — far more
// importantly — a committed write must not be missing one.
//
// **Every write path that touches `ClassicDemonList.listIndex` must go through
// `recordRankingMove`, `recordRankingBulkReplace` or `recordRankingRebalance`.**
// A path that skips it leaves a permanent hole in that level's index history,
// and nothing can fill it in later. `invariants.integration.test.ts` sweeps the whole database for exactly
// that gap.
//
// The read side lives beside this file rather than in it: feed.ts is the Log
// page's merge of activity_log with progress_updates, and rankHistory.ts is one
// level's position history. Discord notifications are still unbuilt — see
// docs/EVENT_LOG.md for what is deliberately absent and why.

import { ActivityEventType, ActivityImpactRole, Prisma } from '@prisma/client'
import { milestoneCrossed } from './milestones'
import type { FieldChange } from './fieldScope'

type Tx = Prisma.TransactionClient

/** One placed entry in a point-in-time reading of the classic demon list. */
export interface RankingSnapshotEntry {
  levelProgressId: string
  levelId: string
  /** Snapshotted onto the impact row — see `ActivityLogLevelImpact.levelName`. */
  levelName: string | null
  listIndex: Prisma.Decimal
}

/**
 * A user's whole classic demon list in display order — hardest (#1) first, which
 * is `listIndex` DESC. Array position + 1 is the level's 1-based position.
 */
export type RankingSnapshot = RankingSnapshotEntry[]

/**
 * Reads the caller's classic demon list so a mutation can be diffed against it.
 *
 * Callers take one snapshot immediately before their write and one immediately
 * after, both inside the same transaction, and hand the pair to
 * {@link recordRankingMove} or {@link recordRankingRebalance}. Diffing two real
 * readings is what keeps positions correct without every write path having to
 * re-derive "and everything below shifts by one" for itself.
 *
 * @param tx - The caller's transaction client. This must not open its own.
 */
export async function readRankingSnapshot(
  tx: Tx,
  userId: string
): Promise<RankingSnapshot> {
  const rows = await tx.classicDemonList.findMany({
    where: { userId },
    orderBy: { listIndex: 'desc' },
    select: {
      levelProgressId: true,
      listIndex: true,
      levelProgress: {
        select: { levelId: true, level: { select: { name: true } } },
      },
    },
  })
  return rows.map((row) => ({
    levelProgressId: row.levelProgressId,
    levelId: row.levelProgress.levelId,
    levelName: row.levelProgress.level.name,
    listIndex: row.listIndex,
  }))
}

// A snapshot indexed for lookup: the entry itself plus its 1-based position.
type IndexedSnapshot = Map<
  string,
  { entry: RankingSnapshotEntry; position: number }
>

function indexSnapshot(snapshot: RankingSnapshot): IndexedSnapshot {
  return new Map(
    snapshot.map((entry, i) => [
      entry.levelProgressId,
      { entry, position: i + 1 },
    ])
  )
}

// The entries immediately above and below `levelProgressId` in one snapshot.
// Absent when the level isn't in that snapshot (a placement has no "before"
// neighbours, an unranking no "after" ones), and one-sided at either end.
function immediateNeighbours(
  snapshot: RankingSnapshot,
  levelProgressId: string
): string[] {
  const i = snapshot.findIndex((e) => e.levelProgressId === levelProgressId)
  if (i === -1) return []
  return [snapshot[i - 1], snapshot[i + 1]]
    .filter((e): e is RankingSnapshotEntry => e !== undefined)
    .map((e) => e.levelProgressId)
}

// One impact row minus the eventId the caller stamps on. Declared rather than
// derived from Prisma's CreateManyInput so `levelId` stays required here — the
// column is nullable for history that outlives the level cache, but nothing on
// a write path has a reason to omit it.
type ImpactRowData = {
  levelId: string
  levelName: string | null
  role: ActivityImpactRole
  listIndex: Prisma.Decimal
  positionBefore: number | null
  positionAfter: number | null
  milestoneCrossed: number | null
}

// Builds one impact row from whichever snapshot still knows the level. `after`
// wins when both do; on an unranking only `before` does, and the index it
// carries is the last value the level actually held — the row's null
// positionAfter is what says it left.
function impactRow(
  levelProgressId: string,
  role: ActivityImpactRole,
  before: IndexedSnapshot,
  after: IndexedSnapshot
): ImpactRowData | null {
  const source = after.get(levelProgressId) ?? before.get(levelProgressId)
  if (!source) return null
  const positionBefore = before.get(levelProgressId)?.position ?? null
  const positionAfter = after.get(levelProgressId)?.position ?? null
  return {
    levelId: source.entry.levelId,
    levelName: source.entry.levelName,
    role,
    listIndex: source.entry.listIndex,
    positionBefore,
    positionAfter,
    milestoneCrossed: milestoneCrossed(positionBefore, positionAfter),
  }
}

/** The three user-driven demon list events. Rebalances have their own function. */
export type RankingMoveEventType =
  | typeof ActivityEventType.DEMON_LIST_PLACEMENT
  | typeof ActivityEventType.DEMON_LIST_REORDER
  | typeof ActivityEventType.DEMON_LIST_REMOVED

/**
 * Records one demon list move: a placement, a reorder, or an unranking.
 *
 * One event per move action, with an impact row for the mover and for each
 * level immediately adjacent to it in either snapshot — up to four neighbours
 * for a reorder, which leaves one gap and opens another. Levels further down
 * the list whose ordinal merely shifted get nothing; recording the whole
 * cascade would turn a single drag into hundreds of rows saying nothing the
 * mover's row doesn't already imply. See docs/DEMON_LIST.md.
 *
 * Milestone crossings are computed per impact row, so a neighbour pushed out of
 * the top 10 by someone else's placement carries that crossing on its own row.
 *
 * @param tx - The caller's transaction client; the event commits with the move
 * or not at all. This must not open its own transaction.
 * @param params.moverLevelProgressId - The entry the user acted on. It must
 * appear in `before`, `after`, or both — an unranking has it only in `before`,
 * a placement only in `after`.
 * @param params.before - Snapshot taken immediately before the write.
 * @param params.after - Snapshot taken immediately after it.
 */
export async function recordRankingMove(
  tx: Tx,
  params: {
    userId: string
    eventType: RankingMoveEventType
    moverLevelProgressId: string
    before: RankingSnapshot
    after: RankingSnapshot
  }
): Promise<void> {
  const { userId, eventType, moverLevelProgressId, before, after } = params
  const beforeIndex = indexSnapshot(before)
  const afterIndex = indexSnapshot(after)

  const mover = impactRow(
    moverLevelProgressId,
    ActivityImpactRole.MOVER,
    beforeIndex,
    afterIndex
  )
  // The mover is in neither snapshot — nothing happened that can be described.
  // Callers only reach this with an entry they just wrote, so this is
  // defensive rather than a case that occurs.
  if (!mover) return

  const neighbourIds = new Set([
    ...immediateNeighbours(before, moverLevelProgressId),
    ...immediateNeighbours(after, moverLevelProgressId),
  ])
  neighbourIds.delete(moverLevelProgressId)

  const impacts = [mover]
  for (const id of neighbourIds) {
    const row = impactRow(
      id,
      ActivityImpactRole.NEIGHBOR,
      beforeIndex,
      afterIndex
    )
    if (row) impacts.push(row)
  }

  const event = await tx.activityLog.create({
    data: { userId, eventType, levelId: mover.levelId },
    select: { id: true },
  })
  await tx.activityLogLevelImpact.createMany({
    data: impacts.map((impact) => ({ ...impact, eventId: event.id })),
  })
}

/** The two demon list events that rewrite every index at once. */
export type RankingListWideEventType =
  | typeof ActivityEventType.DEMON_LIST_BULK_REPLACE
  | typeof ActivityEventType.DEMON_LIST_REBALANCE

// One event covering a wholesale rewrite of the index space, with an impact row
// per level in the list. Every row is a MOVER: nothing here is a bystander, and
// there is no single level the event is "about", so levelId stays null.
async function recordListWideRankingEvent(
  tx: Tx,
  userId: string,
  eventType: RankingListWideEventType,
  before: RankingSnapshot,
  after: RankingSnapshot
): Promise<void> {
  const beforeIndex = indexSnapshot(before)
  const afterIndex = indexSnapshot(after)
  const ids = new Set([...beforeIndex.keys(), ...afterIndex.keys()])
  if (ids.size === 0) return

  const impacts = [...ids]
    .map((id) =>
      impactRow(id, ActivityImpactRole.MOVER, beforeIndex, afterIndex)
    )
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const event = await tx.activityLog.create({
    data: { userId, eventType },
    select: { id: true },
  })
  await tx.activityLogLevelImpact.createMany({
    data: impacts.map((impact) => ({ ...impact, eventId: event.id })),
  })
}

/**
 * Records the spreadsheet import replacing the user's classic demon list.
 *
 * ONE user-facing event for the whole replace, with an impact row per level —
 * not one event per level. The user performed a single import; a feed that
 * spelled it out level by level would bury everything else they have ever done.
 * The impact rows are what a reader expands into "42 levels reordered".
 *
 * Separate from {@link recordRankingRebalance} despite the identical row shape,
 * because that difference is the whole point: a replace changes the order the
 * user sees and belongs in their feed, a rebalance changes only the numbers
 * behind it and must never surface. Do not merge them back together.
 *
 * @param tx - The caller's transaction client. This must not open its own.
 * @param before - Snapshot from immediately before the replace.
 * @param after - Snapshot from immediately after it. Membership legitimately
 * differs — a replace adds and drops entries — and a level the replace dropped
 * gets a row with its last held index and a null `positionAfter`.
 */
export async function recordRankingBulkReplace(
  tx: Tx,
  userId: string,
  before: RankingSnapshot,
  after: RankingSnapshot
): Promise<void> {
  return recordListWideRankingEvent(
    tx,
    userId,
    ActivityEventType.DEMON_LIST_BULK_REPLACE,
    before,
    after
  )
}

/**
 * Records the renormalisation that runs when a neighbour gap closes past
 * `REBALANCE_GAP`, carrying every entry's new `listIndex`.
 *
 * INTERNAL ONLY. The order the user sees is unchanged — only the numbers
 * underneath it move — so this must never reach a Log/timeline feed or a
 * Discord channel mapping. It is the one hidden event type.
 *
 * It exists so that a level's logged index values all live in the SAME
 * coordinate system. Without it a renormalisation would silently invalidate
 * every index logged before it, and reconstruction would compare 2.4375 against
 * a 7 that now means something else — with nothing in the data to show that
 * anything had happened.
 *
 * @param tx - The caller's transaction client. This must not open its own.
 * @param before - Snapshot from immediately before the rewrite.
 * @param after - Snapshot from immediately after it. Same membership as
 * `before`: a renormalisation neither adds nor drops entries, so every impact
 * row carries equal positions.
 */
export async function recordRankingRebalance(
  tx: Tx,
  userId: string,
  before: RankingSnapshot,
  after: RankingSnapshot
): Promise<void> {
  return recordListWideRankingEvent(
    tx,
    userId,
    ActivityEventType.DEMON_LIST_REBALANCE,
    before,
    after
  )
}

/**
 * Records one save of a user's log entry as a single LOG_EDIT event.
 *
 * One event per save with one child row per field that actually changed — never
 * one event per field. A save that changed nothing in scope writes nothing at
 * all, which is why `changes` being empty is a silent no-op rather than an
 * empty event.
 *
 * No ranking position or index is captured here, unlike the demon list events:
 * weighted totals are computed at query time and rating history has no
 * reconstruction requirement, so there is nothing to snapshot.
 *
 * @param tx - The caller's transaction client. This must not open its own.
 * @param levelId - The GD level the edited entry belongs to.
 * @param changes - Output of `buildFieldChanges` / `buildRatingScoreChanges`.
 */
export async function recordLogEdit(
  tx: Tx,
  params: { userId: string; levelId: string; changes: FieldChange[] }
): Promise<void> {
  const { userId, levelId, changes } = params
  if (changes.length === 0) return
  await tx.activityLog.create({
    data: {
      userId,
      eventType: ActivityEventType.LOG_EDIT,
      levelId,
      fieldChanges: { create: changes },
    },
    select: { id: true },
  })
}

/**
 * The `create` payload for one RATING_CONFIG_CHANGE event.
 *
 * Returned as data rather than written here because the rating-config save is a
 * `prisma.$transaction([...])` array, not a callback — the caller appends
 * `prisma.activityLog.create({ data: ratingConfigChangeData(...) })` to that
 * array so the event commits with the config or rolls back with it.
 *
 * The event is user-scoped: `levelId` is null and it has no impact rows. The
 * knock-on effect a weight change has on every level's weighted total and rank
 * position is deliberately NOT computed or logged — it would be a feed full of
 * movement the user never made.
 *
 * @param changes - Field rows tagged `RATING_CONFIG`. Never empty in practice —
 * the caller skips the event entirely when the save changed nothing.
 */
export function ratingConfigChangeData(
  userId: string,
  changes: FieldChange[]
): Prisma.ActivityLogCreateInput {
  return {
    user: { connect: { id: userId } },
    eventType: ActivityEventType.RATING_CONFIG_CHANGE,
    fieldChanges: { create: changes },
  }
}

/**
 * Deletes one level's event history for one user.
 *
 * Called when the user deletes their whole entry for a level: the entry is gone
 * at the user's request, and so is the record of what they did to it.
 *
 * Impact rows on OTHER levels' events that happen to name this level are left
 * standing — they describe those levels' history, not this one's. They survive
 * readable because `levelName` was denormalised onto them at write time; see
 * `ActivityLogLevelImpact.levelName`. The surviving levels' `listIndex`
 * values are untouched by the deletion, so reconstruction is unaffected.
 *
 * @param client - The caller's transaction client.
 */
export async function purgeLevelActivity(
  client: Tx,
  userId: string,
  levelId: string
): Promise<void> {
  await client.activityLog.deleteMany({ where: { userId, levelId } })
}

export {
  buildFieldChanges,
  buildRatingScoreChanges,
  ratingScoreFieldName,
  serializeFieldValue,
  LOG_EDIT_FIELD_SCOPE,
} from './fieldScope'
export type { FieldChange, FieldScopeEntry } from './fieldScope'
export { MILESTONE_THRESHOLDS, milestoneCrossed } from './milestones'
export {
  readRatingStandings,
  buildRatingStandingChanges,
} from './ratingStanding'
export type { RatingStanding, RatingStandings } from './ratingStanding'
