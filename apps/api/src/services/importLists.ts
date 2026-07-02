// List import — replaces membership of the lists the spreadsheet names.
//
// Like ranking, this is a dedicated call with replace-per-list semantics: every
// list the sheet mentions has its membership replaced (in the sheet's order);
// lists the sheet doesn't mention are left alone. A list is identified by a
// reserved keyword (want_to_beat / favorites / least_favorites) or, for anything
// else, a custom list name (created on demand).
//
// Level identity resolves like the completion tabs — a listed level need not be
// completed (want-to-beat levels usually aren't), so unknown levels are stubbed
// and queued for async enrichment.

import type { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import type { ImportListEntry } from '@infernolog/core'
import { resolveNamesBatch, ensureStubLevels, enqueueSeedIds } from './import'
import { logger } from '../utils/logger'

type Tx = Prisma.TransactionClient
type ListType = 'WANT_TO_BEAT' | 'FAVORITES' | 'LEAST_FAVORITES' | 'CUSTOM'

interface ListTarget {
  key: string // grouping key (stable per target list)
  type: ListType
  name: string // display / custom-list name
}

// Maps the sheet's `list` value to a target list. Reserved keywords are matched
// loosely (case / spacing / spelling); anything else is a custom list by name.
function classifyList(raw: string): ListTarget {
  const k = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (k === 'wanttobeat') return { key: 'type:WANT_TO_BEAT', type: 'WANT_TO_BEAT', name: 'Want to Beat' }
  if (['favorites', 'favourites', 'favorite', 'favourite'].includes(k))
    return { key: 'type:FAVORITES', type: 'FAVORITES', name: 'Favorites' }
  if (['leastfavorites', 'leastfavourites', 'leastfavorite', 'leastfavourite'].includes(k))
    return { key: 'type:LEAST_FAVORITES', type: 'LEAST_FAVORITES', name: 'Least Favorites' }
  const name = raw.trim()
  return { key: `custom:${name.toLowerCase()}`, type: 'CUSTOM', name }
}

type ListRow = { id: string; name: string; type: ListType }

// Find-or-create the UserList for a target, keeping `existing` up to date so
// later entries for the same list reuse it.
async function resolveListId(
  tx: Tx,
  userId: string,
  target: ListTarget,
  existing: ListRow[]
): Promise<string> {
  const found =
    target.type === 'CUSTOM'
      ? existing.find(
          (l) => l.type === 'CUSTOM' && l.name.trim().toLowerCase() === target.name.toLowerCase()
        )
      : existing.find((l) => l.type === target.type)
  if (found) return found.id

  const created = await tx.userList.create({
    data: { userId, name: target.name, type: target.type },
    select: { id: true, name: true, type: true },
  })
  existing.push(created as ListRow)
  return created.id
}

export interface ImportListsResult {
  lists: { list: string; placed: number }[]
  skipped: { list: string; label: string; reason: string }[]
}

export async function commitImportLists(
  userId: string,
  entries: ImportListEntry[]
): Promise<ImportListsResult> {
  const skipped: ImportListsResult['skipped'] = []

  interface ResolvedEntry {
    levelId: string
    position: number | null
  }
  const groups = new Map<string, { target: ListTarget; entries: ResolvedEntry[]; seen: Set<string> }>()
  const allLevelIds = new Set<string>()

  // Pre-resolve every name-only entry against the DB in bulk (RobTop only for
  // DB misses), so a large name-only tab isn't one query per row.
  const nameOnly = entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => !e.levelId && e.levelName)
  const resolvedByIndex = new Map<number, Awaited<ReturnType<typeof resolveNamesBatch>>[number]>()
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

  // ── Group resolved entries by target list, preserving order ───────────
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!
    const target = classifyList(entry.list)
    const label = entry.levelName ?? (entry.levelId ? `level ${entry.levelId}` : target.name)

    let levelId = entry.levelId ?? undefined
    if (!levelId && entry.levelName) {
      const res = resolvedByIndex.get(index) ?? null
      if (res === 'ambiguous') {
        skipped.push({ list: target.name, label, reason: 'Matches more than one level — add a level_id' })
        continue
      }
      if (res === null) {
        skipped.push({ list: target.name, label, reason: 'Level not found on the GD servers' })
        continue
      }
      levelId = res.levelId
    }
    if (!levelId) {
      skipped.push({ list: target.name, label, reason: 'No level_id or level_name provided' })
      continue
    }

    let g = groups.get(target.key)
    if (!g) {
      g = { target, entries: [], seen: new Set() }
      groups.set(target.key, g)
    }
    if (g.seen.has(levelId)) {
      skipped.push({ list: target.name, label, reason: 'Already in this list (duplicate)' })
      continue
    }
    g.seen.add(levelId)
    g.entries.push({ levelId, position: entry.position ?? null })
    allLevelIds.add(levelId)
  }

  // Order within each list: by explicit position if every entry has one, else
  // the order they arrived (the sheet's row order).
  for (const g of groups.values()) {
    const allHavePos = g.entries.length > 0 && g.entries.every((e) => e.position != null)
    if (allHavePos) g.entries.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }

  const result: ImportListsResult = { lists: [], skipped }
  if (groups.size === 0) return result

  let newStubIds: string[] = []
  await prisma.$transaction(async (tx) => {
    newStubIds = await ensureStubLevels(tx, [...allLevelIds])

    const existing = (await tx.userList.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    })) as ListRow[]

    for (const g of groups.values()) {
      const listId = await resolveListId(tx, userId, g.target, existing)
      await tx.levelListEntry.deleteMany({ where: { listId } })
      if (g.entries.length) {
        await tx.levelListEntry.createMany({
          data: g.entries.map((e, i) => ({ listId, levelId: e.levelId, position: i })),
        })
      }
      result.lists.push({ list: g.target.name, placed: g.entries.length })
    }
  })

  if (newStubIds.length) {
    try {
      await enqueueSeedIds(newStubIds)
    } catch (err) {
      logger.warn({ newStubIds, err }, 'importLists: failed to enqueue seed IDs')
    }
  }

  return result
}
