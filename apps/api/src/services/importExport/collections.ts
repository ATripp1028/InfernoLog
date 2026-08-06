// Collection import (the sheet's "Lists" tab) — replaces membership of the
// collections the spreadsheet names.
//
// Like ranking, this is a dedicated call with replace-per-collection semantics:
// every collection the sheet mentions has its membership replaced (in the
// sheet's order); collections the sheet doesn't mention are left alone. A
// collection is identified by a reserved keyword (want_to_beat / favorites /
// least_favorites) or, for anything else, a custom collection name (created on
// demand).
//
// Level identity resolves like the completion tabs — a collected level need not
// be completed (want-to-beat levels usually aren't), so unknown levels are
// stubbed and queued for async enrichment. Want to Beat only accepts levels
// without a completion; completed levels are skipped with a reason.

import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import type { ImportCollectionEntry, ImportListMerge } from '@infernolog/core'
import {
  resolveNamesBatch,
  ensureStubLevels,
  enqueueSeedIds,
} from '../importExport/import'
import { computeListMerge } from '../../utils/listMerge'
import { logger } from '../../utils/logger'

type Tx = Prisma.TransactionClient
type CollectionType =
  | 'WANT_TO_BEAT'
  | 'FAVORITES'
  | 'LEAST_FAVORITES'
  | 'CUSTOM'

interface CollectionTarget {
  key: string // grouping key (stable per target collection)
  type: CollectionType
  name: string // display / custom-collection name
}

// Maps the sheet's `list` value to a target collection. Reserved keywords are
// matched loosely (case / spacing / spelling); anything else is a custom
// collection by name.
export function classifyCollection(raw: string): CollectionTarget {
  const k = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (k === 'wanttobeat')
    return {
      key: 'type:WANT_TO_BEAT',
      type: 'WANT_TO_BEAT',
      name: 'Want to Beat',
    }
  if (['favorites', 'favourites', 'favorite', 'favourite'].includes(k))
    return { key: 'type:FAVORITES', type: 'FAVORITES', name: 'Favorites' }
  if (
    [
      'leastfavorites',
      'leastfavourites',
      'leastfavorite',
      'leastfavourite',
    ].includes(k)
  )
    return {
      key: 'type:LEAST_FAVORITES',
      type: 'LEAST_FAVORITES',
      name: 'Least Favorites',
    }
  const name = raw.trim()
  return { key: `custom:${name.toLowerCase()}`, type: 'CUSTOM', name }
}

type CollectionRow = { id: string; name: string; type: CollectionType }

// Find-or-create the Collection for a target, keeping `existing` up to date so
// later entries for the same collection reuse it.
async function resolveCollectionId(
  tx: Tx,
  userId: string,
  target: CollectionTarget,
  existing: CollectionRow[]
): Promise<string> {
  const found =
    target.type === 'CUSTOM'
      ? existing.find(
          (l) =>
            l.type === 'CUSTOM' &&
            l.name.trim().toLowerCase() === target.name.toLowerCase()
        )
      : existing.find((l) => l.type === target.type)
  if (found) return found.id

  const created = await tx.collection.create({
    data: { userId, name: target.name, type: target.type },
    select: { id: true, name: true, type: true },
  })
  existing.push(created as CollectionRow)
  return created.id
}

export interface ImportCollectionsResult {
  lists: { list: string; placed: number }[]
  skipped: { list: string; label: string; reason: string }[]
}

interface ResolvedCollectionEntry {
  levelId: string
  label: string
  position: number | null
}

interface CollectionGroup {
  target: CollectionTarget
  entries: ResolvedCollectionEntry[]
}

// Resolves every sheet entry to a levelId and groups them by target
// collection, ordered by explicit position (if every entry in the group has
// one) or otherwise by sheet row order. Shared by commitImportCollections
// and checkCollectionsMerge — both need the exact same "what does the sheet
// want this collection to contain, in what order" answer; only what happens
// with that answer differs (write it, or diff it against the existing
// order).
async function resolveCollectionEntries(
  entries: ImportCollectionEntry[]
): Promise<{
  groups: Map<string, CollectionGroup>
  skipped: ImportCollectionsResult['skipped']
}> {
  const skipped: ImportCollectionsResult['skipped'] = []
  const groups = new Map<string, CollectionGroup & { seen: Set<string> }>()

  // Pre-resolve every name-only entry against the DB in bulk (RobTop only for
  // DB misses), so a large name-only tab isn't one query per row.
  const nameOnly = entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => !e.levelId && e.levelName)
  const resolvedByIndex = new Map<
    number,
    Awaited<ReturnType<typeof resolveNamesBatch>>[number]
  >()
  if (nameOnly.length > 0) {
    const resolved = await resolveNamesBatch(
      nameOnly.map(({ e }) => ({
        name: e.levelName as string,
        creator: e.creator,
        inGameDifficulty: e.inGameDifficulty,
      }))
    )
    nameOnly.forEach(({ index }, i) => resolvedByIndex.set(index, resolved[i]!))
  }

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!
    const target = classifyCollection(entry.list)
    const label =
      entry.levelName ??
      (entry.levelId ? `level ${entry.levelId}` : target.name)

    let levelId = entry.levelId ?? undefined
    if (!levelId && entry.levelName) {
      const res = resolvedByIndex.get(index) ?? null
      if (res === 'ambiguous') {
        skipped.push({
          list: target.name,
          label,
          reason: 'Matches more than one level — add a level_id',
        })
        continue
      }
      if (res === null) {
        skipped.push({
          list: target.name,
          label,
          reason: 'Level not found on the GD servers',
        })
        continue
      }
      levelId = res.levelId
    }
    if (!levelId) {
      skipped.push({
        list: target.name,
        label,
        reason: 'No level_id or level_name provided',
      })
      continue
    }

    let g = groups.get(target.key)
    if (!g) {
      g = { target, entries: [], seen: new Set() }
      groups.set(target.key, g)
    }
    if (g.seen.has(levelId)) {
      skipped.push({
        list: target.name,
        label,
        reason: 'Already in this collection (duplicate)',
      })
      continue
    }
    g.seen.add(levelId)
    g.entries.push({ levelId, label, position: entry.position ?? null })
  }

  // Order within each collection: by explicit position if every entry has one,
  // else the order they arrived (the sheet's row order).
  for (const g of groups.values()) {
    const allHavePos =
      g.entries.length > 0 && g.entries.every((e) => e.position != null)
    if (allHavePos)
      g.entries.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }

  return { groups, skipped }
}

export async function commitImportCollections(
  userId: string,
  entries: ImportCollectionEntry[]
): Promise<ImportCollectionsResult> {
  const { groups, skipped } = await resolveCollectionEntries(entries)
  const allLevelIds = new Set(
    [...groups.values()].flatMap((g) => g.entries.map((e) => e.levelId))
  )

  const result: ImportCollectionsResult = { lists: [], skipped }
  if (groups.size === 0) return result

  let newStubIds: string[] = []
  await prisma.$transaction(async (tx) => {
    newStubIds = await ensureStubLevels(tx, [...allLevelIds])

    const existing = (await tx.collection.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    })) as CollectionRow[]

    for (const g of groups.values()) {
      // Want to Beat only holds levels without a completion.
      let placeable = g.entries
      if (g.target.type === 'WANT_TO_BEAT') {
        const completed = new Set(
          (
            await tx.levelProgress.findMany({
              where: {
                userId,
                levelId: { in: g.entries.map((e) => e.levelId) },
                progressUpdates: { some: { kind: 'COMPLETION' } },
              },
              select: { levelId: true },
            })
          ).map((lp) => lp.levelId)
        )
        placeable = g.entries.filter((e) => {
          if (!completed.has(e.levelId)) return true
          skipped.push({
            list: g.target.name,
            label: e.label,
            reason:
              'Already completed — Want to Beat only holds unbeaten levels',
          })
          return false
        })
      }

      const collectionId = await resolveCollectionId(
        tx,
        userId,
        g.target,
        existing
      )
      await tx.collectionEntry.deleteMany({ where: { collectionId } })
      if (placeable.length) {
        await tx.collectionEntry.createMany({
          // Fresh integer fractional indices 1.0, 2.0, … in sheet order.
          data: placeable.map((e, i) => ({
            collectionId,
            levelId: e.levelId,
            rankingIndex: i + 1,
          })),
        })
      }
      result.lists.push({ list: g.target.name, placed: placeable.length })
    }
  })

  if (newStubIds.length) {
    try {
      await enqueueSeedIds(newStubIds)
    } catch (err) {
      logger.warn(
        { newStubIds, err },
        'importCollections: failed to enqueue seed IDs'
      )
    }
  }

  return result
}

// Pre-commit merge check: for every collection the sheet touches that
// already has existing membership, diffs the sheet's desired order against
// the existing order via the git-like list merge (see utils/listMerge.ts).
// A collection the sheet doesn't mention, or that doesn't exist yet / is
// currently empty, has nothing to reconcile — commit proceeds with the
// plain sheet order exactly as it does today, no entry is returned for it.
export async function checkCollectionsMerge(
  userId: string,
  entries: ImportCollectionEntry[]
): Promise<ImportListMerge[]> {
  const { groups } = await resolveCollectionEntries(entries)
  if (groups.size === 0) return []

  const existingCollections = await prisma.collection.findMany({
    where: { userId },
    select: {
      name: true,
      type: true,
      entries: {
        orderBy: { rankingIndex: 'asc' },
        select: { levelId: true },
      },
    },
  })
  const existingByKey = new Map<string, string[]>()
  for (const c of existingCollections) {
    const key =
      c.type === 'CUSTOM'
        ? `custom:${c.name.trim().toLowerCase()}`
        : `type:${c.type}`
    existingByKey.set(
      key,
      c.entries.map((e) => e.levelId)
    )
  }

  // Every levelId that could appear in a merge entry, across both sides —
  // fetched once for display names rather than per-collection.
  const allLevelIds = new Set<string>()
  for (const g of groups.values()) {
    for (const e of g.entries) allLevelIds.add(e.levelId)
    for (const id of existingByKey.get(g.target.key) ?? []) allLevelIds.add(id)
  }
  const levels = allLevelIds.size
    ? await prisma.level.findMany({
        where: { inGameId: { in: [...allLevelIds] } },
        select: { inGameId: true, name: true },
      })
    : []
  const nameById = new Map(levels.map((l) => [l.inGameId, l.name]))
  const toEntries = (ids: string[]) =>
    ids.map((id) => ({ levelId: id, levelName: nameById.get(id) ?? null }))

  const merges: ImportListMerge[] = []
  for (const g of groups.values()) {
    const existingIds = existingByKey.get(g.target.key)
    if (!existingIds || existingIds.length === 0) continue // nothing to reconcile

    const importedIds = g.entries.map((e) => e.levelId)
    const merge = computeListMerge(existingIds, importedIds)
    if (!merge.hasConflict) continue

    merges.push({
      list: g.target.name,
      mergedSeed: toEntries(merge.mergedSeed),
      importedRemainder: toEntries(merge.importedRemainder),
      existingRemainder: toEntries(merge.existingRemainder),
      hasConflict: merge.hasConflict,
      importedOrder: toEntries(importedIds),
      existingOrder: toEntries(existingIds),
    })
  }

  return merges
}
