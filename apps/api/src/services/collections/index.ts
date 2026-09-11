// Collections service — user-owned groupings of levels: the three built-ins
// (Want to Beat / Favorites / Least Favorites) plus custom named collections.
//
// Reads and writes live here; routes/collections.ts stays a thin HTTP shell,
// mirroring the demon list.ts ↔ services/demonList.ts split.
//
// Ordering: CollectionEntry.rankingIndex is a fractional index displayed
// ascending (lower = earlier). Adds append at the end; reorders bisect the gap
// between the two neighbours the client drops between, renormalising to
// integers when the gap closes past the rebalance threshold (the same pattern
// as the classic demon list — see utils/fractionalIndex.ts).
//
// Want to Beat is the one collection with membership constraints: it only
// accepts levels the user has NOT completed, and a level is auto-removed from
// it when a completion is logged (removeFromWantToBeat is called inside the
// completion write paths' transactions).
//
// Ordering: a collection is ORDERED (the fractional index above is its order)
// or UNORDERED (no curated order — the page browses it through
// browseCollection with the /search sorts and filters). Favorites and Least
// Favorites are always ordered.

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import {
  COLLECTION_ERRORS,
  isCollectionOrderingConvertible,
  isReservedCollectionName,
  type CollectionErrorCode,
  type CollectionOrdering,
  type CreateCollectionInput,
  type LevelBrowseQuery,
  type UpdateCollectionInput,
  type ReorderCollectionEntryInput,
} from '@infernolog/core'
import { bisectIndices, gapTooTight } from '../../utils/fractionalIndex'
import {
  levelSummarySelect,
  completionSelect,
  deriveBadge,
  mapLevel,
  type CompletionRefs,
} from '../levels/row'
import { browseLevels } from '../levels/browse'

type Tx = Prisma.TransactionClient

/**
 * Caller-fixable rule violation, carrying the machine-readable code the client
 * branches on and the HTTP status the route maps it to.
 */
export class CollectionError extends Error {
  constructor(
    public code: CollectionErrorCode,
    public status: 403 | 409 | 422,
    message: string
  ) {
    super(message)
    this.name = 'CollectionError'
  }
}

/**
 * 404 — the targeted collection/entry doesn't exist for this user.
 */
export class CollectionNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollectionNotFoundError'
  }
}

/**
 * 400 — the level isn't cached yet; the client resolves/seeds before adding.
 */
export class CollectionLevelNotCachedError extends Error {
  constructor(levelId: string) {
    super(`Level ${levelId} is not cached. Resolve it before adding.`)
    this.name = 'CollectionLevelNotCachedError'
  }
}

// Built-ins lead the index in a fixed order; customs follow by creation time.
const TYPE_ORDER: Record<string, number> = {
  WANT_TO_BEAT: 0,
  FAVORITES: 1,
  LEAST_FAVORITES: 2,
  CUSTOM: 3,
}

// Number of leading entry level ids returned for the index card's
// thumbnail-cluster preview (the first is the identity thumbnail).
const PREVIEW_LEVELS = 4

/**
 * Lists the user's collections for the index page.
 *
 * Ordered built-ins first in a fixed order (Want to Beat, Favorites, Least
 * Favorites), then custom collections by creation time. Each row carries an
 * entry count and the first few level ids for the card's thumbnail cluster,
 * rather than the entries themselves.
 *
 * @param userId - Internal user UUID from the JWT.
 */
export async function getCollections(userId: string) {
  const rows = await prisma.collection.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
      ordering: true,
      description: true,
      createdAt: true,
      _count: { select: { entries: true } },
      entries: {
        orderBy: { rankingIndex: 'asc' },
        take: PREVIEW_LEVELS,
        select: { levelId: true },
      },
    },
  })
  rows.sort(
    (a, b) =>
      (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  )
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    ordering: c.ordering,
    description: c.description,
    entryCount: c._count.entries,
    previewLevelIds: c.entries.map((e) => e.levelId),
    createdAt: c.createdAt,
  }))
}

type CompletionInfo = { userGddlTier: number | null; updates: CompletionRefs }

// The viewer's completion state per level, for badges + the completed flag.
async function loadCompletionsByLevel(userId: string, levelIds: string[]) {
  if (levelIds.length === 0) return new Map<string, CompletionInfo>()
  const lps = await prisma.levelProgress.findMany({
    where: { userId, levelId: { in: levelIds } },
    select: {
      levelId: true,
      userGddlTier: true,
      progressUpdates: completionSelect,
    },
  })
  return new Map(
    lps.map((lp) => [
      lp.levelId,
      { userGddlTier: lp.userGddlTier, updates: lp.progressUpdates },
    ])
  )
}

/**
 * One collection with its entries in display order (rankingIndex ascending).
 *
 * Each entry is annotated with the viewer's own completion state: the GDDL-tier
 * badge and a `completed` flag. This is the shared return shape of every
 * mutating function in this module, so a write can respond with the new state
 * without the client re-fetching.
 *
 * @param userId - Internal user UUID; also scopes ownership.
 * @param collectionId - Collection to load.
 * @throws {CollectionNotFoundError} No such collection for this user.
 */
export async function getCollectionDetail(
  userId: string,
  collectionId: string
) {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: {
      id: true,
      name: true,
      type: true,
      ordering: true,
      description: true,
      createdAt: true,
      entries: {
        orderBy: { rankingIndex: 'asc' },
        select: {
          id: true,
          rankingIndex: true,
          addedAt: true,
          level: { select: levelSummarySelect },
        },
      },
    },
  })
  if (!collection) throw new CollectionNotFoundError('Collection not found')

  const completions = await loadCompletionsByLevel(
    userId,
    collection.entries.map((e) => e.level.inGameId)
  )

  return {
    id: collection.id,
    name: collection.name,
    type: collection.type,
    ordering: collection.ordering,
    description: collection.description,
    createdAt: collection.createdAt,
    entries: collection.entries.map((e) => {
      const level = e.level
      const info = completions.get(level.inGameId) ?? null
      return {
        id: e.id,
        rankingIndex: e.rankingIndex.toNumber(),
        addedAt: e.addedAt,
        level: mapLevel(level),
        badge: deriveBadge(info?.userGddlTier ?? null),
        completed: (info?.updates.length ?? 0) > 0,
      }
    }),
  }
}

// ─────────────────────────────────────────────
// Collection CRUD (custom collections only for update/delete)
// ─────────────────────────────────────────────

// Name rules shared by create and rename: not a reserved built-in name, and
// unique (case-insensitive) among the user's collections.
async function assertNameAvailable(
  userId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  if (isReservedCollectionName(name)) {
    throw new CollectionError(
      COLLECTION_ERRORS.RESERVED_NAME,
      422,
      `"${name.trim()}" is a built-in collection name`
    )
  }
  const clash = await prisma.collection.findFirst({
    where: {
      userId,
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (clash) {
    throw new CollectionError(
      COLLECTION_ERRORS.DUPLICATE_NAME,
      409,
      `A collection named "${name.trim()}" already exists`
    )
  }
}

/**
 * Creates a custom collection.
 *
 * @param userId - Internal user UUID from the JWT.
 * @param input - Name and optional description, both trimmed, and the
 * ordering (ORDERED when omitted).
 * @returns The new collection in {@link getCollectionDetail} shape.
 * @throws {CollectionError} `RESERVED_NAME` (422) for a built-in name, or
 * `DUPLICATE_NAME` (409) if the user already has one by that name
 * (case-insensitive).
 */
export async function createCollection(
  userId: string,
  input: CreateCollectionInput
) {
  await assertNameAvailable(userId, input.name)
  const created = await prisma.collection.create({
    data: {
      userId,
      name: input.name.trim(),
      type: 'CUSTOM',
      ordering: input.ordering ?? 'ORDERED',
      description: input.description?.trim() || null,
    },
    select: { id: true },
  })
  return getCollectionDetail(userId, created.id)
}

// Loads a collection asserting ownership; optionally asserts it is custom
// (built-ins reject edit/delete).
async function requireCollection(
  userId: string,
  collectionId: string,
  { customOnly }: { customOnly: boolean }
) {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true, type: true, name: true, ordering: true },
  })
  if (!collection) throw new CollectionNotFoundError('Collection not found')
  if (customOnly && collection.type !== 'CUSTOM') {
    throw new CollectionError(
      COLLECTION_ERRORS.BUILT_IN_COLLECTION,
      403,
      'Built-in collections cannot be edited or deleted'
    )
  }
  return collection
}

/**
 * Renames a custom collection and/or edits its description.
 *
 * @param userId - Internal user UUID from the JWT.
 * @param collectionId - Must be a CUSTOM collection.
 * @param input - Sparse patch; only present keys are written.
 * @returns The updated collection in {@link getCollectionDetail} shape.
 * @throws {CollectionNotFoundError} No such collection for this user.
 * @throws {CollectionError} `BUILT_IN_COLLECTION` (403) for a built-in, or
 * `RESERVED_NAME`/`DUPLICATE_NAME` on the new name.
 */
export async function updateCollection(
  userId: string,
  collectionId: string,
  input: UpdateCollectionInput
) {
  await requireCollection(userId, collectionId, { customOnly: true })
  if (input.name !== undefined) {
    await assertNameAvailable(userId, input.name, collectionId)
  }
  await prisma.collection.update({
    where: { id: collectionId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
    },
  })
  return getCollectionDetail(userId, collectionId)
}

/**
 * Deletes a custom collection; its entries cascade via the FK.
 *
 * @param userId - Internal user UUID from the JWT.
 * @param collectionId - Must be a CUSTOM collection.
 * @throws {CollectionNotFoundError} No such collection for this user.
 * @throws {CollectionError} `BUILT_IN_COLLECTION` (403) — built-ins can't be deleted.
 */
export async function deleteCollection(userId: string, collectionId: string) {
  await requireCollection(userId, collectionId, { customOnly: true })
  // Entries cascade via the FK.
  await prisma.collection.delete({ where: { id: collectionId } })
}

// Level ids are digits-only (LevelIdSchema), so length-then-text is numeric
// order without a cast that one malformed id could fail.
function compareLevelIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
}

// Rewrites a collection's indices to 1 … N in level-ID order, in one
// statement. Runs inside the caller's transaction.
async function renumberByLevelId(tx: Tx, collectionId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "collection_entries" AS ce
    SET "rankingIndex" = r.pos
    FROM (
      SELECT "id",
             ROW_NUMBER() OVER (ORDER BY LENGTH("levelId"), "levelId") AS pos
      FROM "collection_entries"
      WHERE "collectionId" = ${collectionId}
    ) AS r
    WHERE ce."id" = r."id"
  `
}

/**
 * Switches a collection between ORDERED and UNORDERED.
 *
 * Either direction renumbers the entries by level ID. Going UNORDERED, that is
 * the curated order being discarded — the client warns before it asks. Going
 * ORDERED, it means the collection starts in the order its unordered view
 * showed by default, rather than in whatever order levels happened to be
 * added. Setting the ordering a collection already has is a no-op.
 *
 * @param userId - Internal user UUID from the JWT.
 * @param collectionId - Any collection but Favorites / Least Favorites.
 * @param ordering - The ordering to switch to.
 * @returns The collection in {@link getCollectionDetail} shape.
 * @throws {CollectionNotFoundError} No such collection for this user.
 * @throws {CollectionError} `ORDERING_FIXED` (403) for Favorites or Least
 * Favorites, which are always ordered.
 */
export async function setCollectionOrdering(
  userId: string,
  collectionId: string,
  ordering: CollectionOrdering
) {
  const collection = await requireCollection(userId, collectionId, {
    customOnly: false,
  })
  if (!isCollectionOrderingConvertible(collection.type)) {
    throw new CollectionError(
      COLLECTION_ERRORS.ORDERING_FIXED,
      403,
      `${collection.name} is always ordered`
    )
  }
  if (collection.ordering !== ordering) {
    await prisma.$transaction(async (tx) => {
      await tx.collection.update({
        where: { id: collectionId },
        data: { ordering },
      })
      await renumberByLevelId(tx, collectionId)
    })
  }
  return getCollectionDetail(userId, collectionId)
}

// ─────────────────────────────────────────────
// Entries — add / remove / reorder
// ─────────────────────────────────────────────

/**
 * Adds a level to a collection, appended at the end of the order.
 *
 * Idempotent per (collection, level) — re-adding an existing entry is a no-op,
 * matching the UI, which greys duplicates out with an "Added" tag.
 *
 * Want to Beat is the one collection with a membership rule: it holds only
 * levels the user has not completed.
 *
 * @param userId - Internal user UUID from the JWT.
 * @param collectionId - Any collection, built-in or custom.
 * @param levelId - GD level ID; must already be in the levels cache.
 * @returns The collection in {@link getCollectionDetail} shape.
 * @throws {CollectionNotFoundError} No such collection for this user.
 * @throws {CollectionLevelNotCachedError} The level isn't cached — the client
 * resolves it through the logging flow before adding.
 * @throws {CollectionError} `LEVEL_ALREADY_COMPLETED` (409) when adding a
 * beaten level to Want to Beat.
 */
export async function addEntry(
  userId: string,
  collectionId: string,
  levelId: string
) {
  const collection = await requireCollection(userId, collectionId, {
    customOnly: false,
  })

  await prisma.$transaction(async (tx) => {
    // The client resolves/seeds through the logging flow's cache-backed path
    // (GET /v1/levels/:id/resolve) before adding, so a miss here is a
    // client-sequencing error, not a reason to call RobTop.
    const level = await tx.level.findUnique({
      where: { inGameId: levelId },
      select: { inGameId: true },
    })
    if (!level) throw new CollectionLevelNotCachedError(levelId)

    // Idempotent per (collection, level): an existing entry is a no-op (the
    // UI greys duplicates out with an "Added" tag).
    const existing = await tx.collectionEntry.findUnique({
      where: { collectionId_levelId: { collectionId, levelId } },
      select: { id: true },
    })
    if (existing) return

    // Want to Beat only holds levels without a completion.
    if (collection.type === 'WANT_TO_BEAT') {
      const completed = await tx.levelProgress.findFirst({
        where: {
          userId,
          levelId,
          progressUpdates: { some: { kind: 'COMPLETION' } },
        },
        select: { id: true },
      })
      if (completed) {
        throw new CollectionError(
          COLLECTION_ERRORS.LEVEL_ALREADY_COMPLETED,
          409,
          'Already completed — Want to Beat only holds unbeaten levels'
        )
      }
    }

    // Append at the end: max index + 1 (1 for the first entry).
    const last = await tx.collectionEntry.findFirst({
      where: { collectionId },
      orderBy: { rankingIndex: 'desc' },
      select: { rankingIndex: true },
    })
    await tx.collectionEntry.create({
      data: {
        collectionId,
        levelId,
        rankingIndex: bisectIndices(last?.rankingIndex ?? null, null),
      },
    })
  })

  return getCollectionDetail(userId, collectionId)
}

/**
 * Removes one entry from a collection.
 *
 * @param userId - Internal user UUID from the JWT.
 * @param collectionId - The owning collection.
 * @param entryId - CollectionEntry id, verified to belong to that collection.
 * @returns The collection in {@link getCollectionDetail} shape.
 * @throws {CollectionNotFoundError} The collection or the entry doesn't exist.
 */
export async function removeEntry(
  userId: string,
  collectionId: string,
  entryId: string
) {
  await requireCollection(userId, collectionId, { customOnly: false })
  const entry = await prisma.collectionEntry.findFirst({
    where: { id: entryId, collectionId },
    select: { id: true },
  })
  if (!entry) throw new CollectionNotFoundError('Collection entry not found')
  await prisma.collectionEntry.delete({ where: { id: entryId } })
  return getCollectionDetail(userId, collectionId)
}

// A neighbour's current index, asserting it belongs to this collection.
async function neighbourIndex(
  tx: Tx,
  collectionId: string,
  entryId: string
): Promise<Prisma.Decimal> {
  const row = await tx.collectionEntry.findFirst({
    where: { id: entryId, collectionId },
    select: { rankingIndex: true },
  })
  if (!row) {
    throw new CollectionNotFoundError(
      `Neighbour ${entryId} is not an entry of this collection`
    )
  }
  return row.rankingIndex
}

// Renormalise a collection's entries to evenly spaced integers (1 … N),
// preserving the current order. Runs inside the caller's transaction.
async function rebalance(tx: Tx, collectionId: string): Promise<void> {
  const rows = await tx.collectionEntry.findMany({
    where: { collectionId },
    orderBy: { rankingIndex: 'asc' },
    select: { id: true },
  })
  let position = 1
  for (const row of rows) {
    await tx.collectionEntry.update({
      where: { id: row.id },
      data: { rankingIndex: new Prisma.Decimal(position) },
    })
    position++
  }
}

/**
 * Moves an entry between two neighbours by bisecting their fractional indices.
 *
 * The client sends the entry ids it was dropped between rather than an absolute
 * position, so concurrent reorders don't fight over indices. When the gap
 * between the neighbours has closed past the rebalance threshold, the whole
 * collection is renormalised to integers first and the neighbours re-read.
 *
 * @param userId - Internal user UUID from the JWT.
 * @param collectionId - The owning collection.
 * @param entryId - The entry being moved.
 * @param input - `prevId` (shown above, lower index) and `nextId` (below,
 * higher index); either may be omitted when dropping at an end.
 * @returns The collection in {@link getCollectionDetail} shape.
 * @throws {CollectionError} `SELF_REFERENTIAL_NEIGHBOR` (422) when the entry is
 * given as its own neighbour.
 * @throws {CollectionNotFoundError} The collection, the entry, or a named
 * neighbour isn't part of this collection.
 */
export async function reorderEntry(
  userId: string,
  collectionId: string,
  entryId: string,
  input: ReorderCollectionEntryInput
) {
  if (input.prevId === entryId || input.nextId === entryId) {
    throw new CollectionError(
      COLLECTION_ERRORS.SELF_REFERENTIAL_NEIGHBOR,
      422,
      'An entry cannot be its own neighbor'
    )
  }
  await requireCollection(userId, collectionId, { customOnly: false })

  await prisma.$transaction(async (tx) => {
    const entry = await tx.collectionEntry.findFirst({
      where: { id: entryId, collectionId },
      select: { id: true },
    })
    if (!entry) throw new CollectionNotFoundError('Collection entry not found')

    // Display order is rankingIndex ASC: prev (shown above) = lower index,
    // next (shown below) = higher index.
    let prev = input.prevId
      ? await neighbourIndex(tx, collectionId, input.prevId)
      : null
    let next = input.nextId
      ? await neighbourIndex(tx, collectionId, input.nextId)
      : null

    if (gapTooTight(prev, next)) {
      await rebalance(tx, collectionId)
      prev = input.prevId
        ? await neighbourIndex(tx, collectionId, input.prevId)
        : null
      next = input.nextId
        ? await neighbourIndex(tx, collectionId, input.nextId)
        : null
    }
    await tx.collectionEntry.update({
      where: { id: entryId },
      data: { rankingIndex: bisectIndices(prev, next) },
    })
  })

  return getCollectionDetail(userId, collectionId)
}

/**
 * Adds every level of one collection that another lacks.
 *
 * New entries are appended to the target in the source's display order —
 * its curated order if ORDERED, level-ID order if not. Levels the target
 * already holds are left where they are. Want to Beat's membership rule
 * applies as it does to a single add, except that a beaten level is skipped
 * and counted rather than failing the whole copy.
 *
 * @param userId - Internal user UUID from the JWT; owns both collections.
 * @param targetId - The collection receiving the levels.
 * @param sourceId - The collection whose levels are copied. It is not changed.
 * @returns The target in {@link getCollectionDetail} shape, plus how many
 * levels were added, already present, and skipped as beaten.
 * @throws {CollectionError} `SAME_COLLECTION` (422) when source and target
 * are the same collection.
 * @throws {CollectionNotFoundError} Either collection doesn't exist for this
 * user.
 */
export async function copyEntries(
  userId: string,
  targetId: string,
  sourceId: string
) {
  if (targetId === sourceId) {
    throw new CollectionError(
      COLLECTION_ERRORS.SAME_COLLECTION,
      422,
      'A collection cannot be added to itself'
    )
  }
  const target = await requireCollection(userId, targetId, {
    customOnly: false,
  })
  const source = await requireCollection(userId, sourceId, {
    customOnly: false,
  })

  const counts = await prisma.$transaction(async (tx) => {
    const sourceEntries = await tx.collectionEntry.findMany({
      where: { collectionId: sourceId },
      orderBy: { rankingIndex: 'asc' },
      select: { levelId: true },
    })
    const sourceIds = sourceEntries.map((e) => e.levelId)
    if (source.ordering === 'UNORDERED') sourceIds.sort(compareLevelIds)

    const present = await tx.collectionEntry.findMany({
      where: { collectionId: targetId, levelId: { in: sourceIds } },
      select: { levelId: true },
    })
    const presentIds = new Set(present.map((e) => e.levelId))
    let toAdd = sourceIds.filter((id) => !presentIds.has(id))

    // Want to Beat only holds levels without a completion.
    let skippedCompleted = 0
    if (target.type === 'WANT_TO_BEAT' && toAdd.length > 0) {
      const completed = await tx.levelProgress.findMany({
        where: {
          userId,
          levelId: { in: toAdd },
          progressUpdates: { some: { kind: 'COMPLETION' } },
        },
        select: { levelId: true },
      })
      const completedIds = new Set(completed.map((c) => c.levelId))
      skippedCompleted = toAdd.filter((id) => completedIds.has(id)).length
      toAdd = toAdd.filter((id) => !completedIds.has(id))
    }

    let added = 0
    if (toAdd.length > 0) {
      const last = await tx.collectionEntry.findFirst({
        where: { collectionId: targetId },
        orderBy: { rankingIndex: 'desc' },
        select: { rankingIndex: true },
      })
      let index = last?.rankingIndex ?? null
      const data = toAdd.map((levelId) => {
        index = bisectIndices(index, null)
        return { collectionId: targetId, levelId, rankingIndex: index }
      })
      // skipDuplicates: a concurrent single add of the same level must not
      // fail the whole copy on the (collection, level) unique.
      const result = await tx.collectionEntry.createMany({
        data,
        skipDuplicates: true,
      })
      added = result.count
    }

    return { added, alreadyPresent: presentIds.size, skippedCompleted }
  })

  return {
    ...counts,
    collection: await getCollectionDetail(userId, targetId),
  }
}

/**
 * One page of a collection's levels, sorted and filtered like the /search
 * page — what an UNORDERED collection's page shows (an ORDERED one may use it
 * too). Each row carries the entry id its remove button needs.
 *
 * @param userId - Internal user UUID from the JWT; must own the collection.
 * @param collectionId - The collection to browse.
 * @param query - The same validated query GET /v1/levels/browse takes.
 * @returns One page of rows plus `nextCursor`, null on the last page.
 * @throws {CollectionNotFoundError} No such collection for this user.
 */
export async function browseCollection(
  userId: string,
  collectionId: string,
  query: LevelBrowseQuery
) {
  await requireCollection(userId, collectionId, { customOnly: false })
  const page = await browseLevels(query, { collectionId })
  const entries = await prisma.collectionEntry.findMany({
    where: { collectionId, levelId: { in: page.data.map((r) => r.inGameId) } },
    select: { id: true, levelId: true },
  })
  const entryIds = new Map(entries.map((e) => [e.levelId, e.id]))
  return {
    // A row whose entry was removed between the two reads is dropped.
    data: page.data.flatMap((row) => {
      const entryId = entryIds.get(row.inGameId)
      return entryId ? [{ ...row, entryId }] : []
    }),
    nextCursor: page.nextCursor,
  }
}

/**
 * Drops levels out of the user's Want to Beat collection.
 *
 * Called by EVERY completion write path — POST /v1/me/completions, the
 * spreadsheet import, and the GDDL sync — from inside the same transaction that
 * records the completion. That is what keeps the "Want to Beat holds only
 * unbeaten levels" invariant true; a new completion path that forgets this call
 * silently breaks it.
 *
 * @param tx - The caller's transaction client; this must not open its own.
 * @param userId - Internal user UUID.
 * @param levelIds - One level ID or many. An empty array is a no-op.
 */
export async function removeFromWantToBeat(
  tx: Tx,
  userId: string,
  levelIds: string | string[]
): Promise<void> {
  const ids = Array.isArray(levelIds) ? levelIds : [levelIds]
  if (ids.length === 0) return
  await tx.collectionEntry.deleteMany({
    where: {
      levelId: { in: ids },
      collection: { userId, type: 'WANT_TO_BEAT' },
    },
  })
}
