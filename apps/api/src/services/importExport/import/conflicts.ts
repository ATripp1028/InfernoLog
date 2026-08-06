// The read-only pre-import conflict scan behind POST /v1/me/import/check.
//
// Replays the same planning logic the commit would run, but writes nothing —
// so the review UI can show exactly which fields a row would change.

// Spreadsheet import service — commit logic for POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop
// writes, cross-tab reconciliation (completion + drop for same level),
// conflict resolution, idempotency via (importJobId, rowIndex) keys,
// name-based level resolution, and GDDL tier autofill.

import prisma from '../../../utils/prisma'
import type {
  ImportCompletionRow,
  ImportFieldDiff,
  ImportRowConflict,
  ImportDuplicateRow,
  ImportCheckRequest,
  ImportCheckResponse,
} from '@infernolog/core'
import { roundGddlTier } from '../../../utils/gddl'
import { checkRatingConflicts } from '../../importExport/ratings'
import { checkCollectionsMerge } from '../../importExport/collections'
import { checkRankingMerge } from '../../importExport/ranking'
import {
  ExistingEventSnapshot,
  createFieldPusher,
  deriveEventKey,
  diffDroppedFields,
  diffProgressFields,
  fetchExistingEvents,
  groupByLevel,
  isoDate,
} from './planEvents'

// ── Check function ─────────────────────────────────────────────────────────

// The subset of an existing completion's data that can conflict with an
// imported completion row — one field per column `buildCompletionProgressUpdateFields`/
// `buildCompletionLpFields` can write.
interface ExistingCompletionSnapshot {
  date: Date | null
  dateTimezone: string | null
  dateUncertain: boolean
  attempts: number | null
  runFrom: number | null
  runTo: number | null
  fps: number | null
  onStream: boolean
  videoUrl: string | null
  highlightUrl: string | null
  notes: string | null
  enjoyment: number | null // internal 0-100
  simpleRating: number | null // internal 0-100
  difficultyOpinion: string | null
  coinsCollected: number | null
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string | null
  device: string | null
  worstFail: number | null
  worstFailDate: Date | null
  worstFailDateTimezone: string | null
  visibility: string
  levelNotes: string | null
  userGddlTier: number | null
}

// A field is a diff only when the sheet actually provides a value (null
// means "left blank" — auto-resolves to the existing value, nothing to
// reconcile) AND that value differs from what's already stored. Equal
// values auto-resolve trivially too. This mirrors the transformations
// buildCompletionProgressUpdateFields/buildCompletionLpFields apply on write,
// so a diff here is exactly "this field would actually change."
function diffCompletionFields(
  existing: ExistingCompletionSnapshot,
  row: ImportCompletionRow,
  hasCoins: boolean
): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = []
  const push = createFieldPusher(diffs)

  push('date', isoDate(existing.date, existing.dateTimezone), row.date ?? null)
  push('dateUncertain', existing.dateUncertain, row.dateUncertain ?? null)
  push('attempts', existing.attempts, row.attempts ?? null)
  push('runFrom', existing.runFrom, row.runFrom ?? null)
  push('runTo', existing.runTo, row.runTo ?? null)
  push('fps', existing.fps, row.fps ?? null)
  push('onStream', existing.onStream, row.onStream ?? null)
  push('videoUrl', existing.videoUrl, row.videoUrl ?? null)
  push('highlightUrl', existing.highlightUrl, row.highlightUrl ?? null)
  push('notes', existing.notes, row.notes ?? null)
  // enjoyment/simpleRating are reported on the wire's 0-10 scale (matching
  // ImportCompletionRow), not the internal 0-100 storage scale — a resolved
  // 'existing' choice gets written straight back into `row.data` with no
  // further conversion, so the diff value and the row's own field must
  // already agree on scale.
  push(
    'enjoyment',
    existing.enjoyment != null ? existing.enjoyment / 10 : null,
    row.enjoyment ?? null
  )
  push(
    'simpleRating',
    existing.simpleRating != null ? existing.simpleRating / 10 : null,
    row.simpleRating ?? null
  )
  push(
    'difficultyOpinion',
    existing.difficultyOpinion,
    row.difficultyOpinion ?? null
  )
  push(
    'coinsCollected',
    existing.coinsCollected,
    hasCoins ? (row.coinsCollected ?? null) : null
  )
  push('twoPlayerSolo', existing.twoPlayerSolo, row.twoPlayerSolo ?? null)
  push(
    'twoPlayerPartner',
    existing.twoPlayerPartner,
    row.twoPlayerPartner ?? null
  )
  push('device', existing.device, row.device ?? null)
  push(
    'worstFail',
    existing.worstFail,
    row.percentage != null ? Math.round(row.percentage) : null
  )
  push(
    'worstFailDate',
    isoDate(existing.worstFailDate, existing.worstFailDateTimezone),
    row.worstFailDate ?? null
  )
  push('visibility', existing.visibility, row.visibility ?? null)
  push('levelNotes', existing.levelNotes, row.levelNotes ?? null)
  push(
    'userGddlTier',
    existing.userGddlTier,
    row.userGddlTier != null ? roundGddlTier(row.userGddlTier) : null
  )

  return diffs
}

// Shared conflict-scan for the progress/dropped derived-key dedup pre-check:
// for each row with a derivable key, scan every existing PROGRESS/DROP row on
// that level and classify it as an exact duplicate (a zero-diff match — no
// conflict to show) or a partial conflict (same key, some other field
// differs — surfaced for the user to resolve). Scans every same-key
// candidate rather than stopping at the first, mirroring the fix in
// matchExistingEvent above, for the same reason: an exact match elsewhere in
// the list must not be shadowed by an earlier partial one.
function scanForConflicts<
  Row extends {
    rowIndex: number
    data: {
      levelId?: string | null | undefined
      levelName?: string | null | undefined
    }
  },
>(
  rows: Row[],
  eventsByLevel: Map<string, ExistingEventSnapshot[]>,
  ops: {
    keyOf: (row: Row) => string | null
    diffOf: (existing: ExistingEventSnapshot, row: Row) => ImportFieldDiff[]
  }
): { conflicts: ImportRowConflict[]; duplicates: ImportDuplicateRow[] } {
  const conflicts: ImportRowConflict[] = []
  const duplicates: ImportDuplicateRow[] = []
  for (const row of rows) {
    const levelId = row.data.levelId!
    const key = ops.keyOf(row)
    if (key == null) continue
    const candidates = eventsByLevel.get(levelId) ?? []
    let bestPartial: {
      existing: ExistingEventSnapshot
      fields: ImportFieldDiff[]
    } | null = null
    let exact = false
    for (const existing of candidates) {
      const existingKey = deriveEventKey({
        date: isoDate(existing.date, existing.dateTimezone),
        percentage: existing.percentage,
        runFrom: existing.runFrom,
        runTo: existing.runTo,
      })
      if (existingKey !== key) continue
      const fields = ops.diffOf(existing, row)
      if (fields.length === 0) {
        exact = true
        break
      }
      if (!bestPartial) bestPartial = { existing, fields }
    }
    if (exact) {
      duplicates.push({ rowIndex: row.rowIndex })
    } else if (bestPartial) {
      conflicts.push({
        rowIndex: row.rowIndex,
        levelId,
        levelName: row.data.levelName ?? null,
        matchedId: bestPartial.existing.id,
        fields: bestPartial.fields,
      })
    }
  }
  return { conflicts, duplicates }
}

// One synchronous pre-commit pass over every tab's parsed rows. Progress/
// Dropped/Ratings/Collections/Ranking slices are wired in by later phases of
// the conflict-resolution rework — until then they always report empty.
export async function checkImportConflicts(
  userId: string,
  req: ImportCheckRequest
): Promise<ImportCheckResponse> {
  const completionRows = req.completions ?? []
  const levelIds = [
    ...new Set(
      completionRows.flatMap((r) => (r.data.levelId ? [r.data.levelId] : []))
    ),
  ]

  const existingRows = levelIds.length
    ? await prisma.levelProgress.findMany({
        where: {
          userId,
          levelId: { in: levelIds },
          progressUpdates: { some: { kind: 'COMPLETION' } },
        },
        include: {
          level: { select: { name: true, coins: true } },
          progressUpdates: {
            where: { kind: 'COMPLETION' },
            select: {
              date: true,
              dateTimezone: true,
              dateUncertain: true,
              attempts: true,
              runFrom: true,
              runTo: true,
              fps: true,
              onStream: true,
              videoUrl: true,
              highlightUrl: true,
              notes: true,
              enjoyment: true,
              difficultyOpinion: true,
              twoPlayerSolo: true,
              twoPlayerPartner: true,
              device: true,
            },
            orderBy: { loggedAt: 'desc' },
            take: 1,
          },
        },
      })
    : []
  const existingByLevelId = new Map(existingRows.map((lp) => [lp.levelId, lp]))

  const completionConflicts: ImportRowConflict[] = []
  for (const row of completionRows) {
    if (!row.data.levelId) continue // name-only rows resolve too late to pre-check
    const lp = existingByLevelId.get(row.data.levelId)
    const pu = lp?.progressUpdates[0]
    if (!lp || !pu) continue

    const snapshot: ExistingCompletionSnapshot = {
      date: pu.date,
      dateTimezone: pu.dateTimezone,
      dateUncertain: pu.dateUncertain,
      attempts: pu.attempts,
      runFrom: pu.runFrom,
      runTo: pu.runTo,
      fps: pu.fps,
      onStream: pu.onStream,
      videoUrl: pu.videoUrl,
      highlightUrl: pu.highlightUrl,
      notes: pu.notes,
      enjoyment: pu.enjoyment,
      simpleRating: lp.simpleRating,
      difficultyOpinion: pu.difficultyOpinion,
      coinsCollected: lp.coinsCollected,
      twoPlayerSolo: pu.twoPlayerSolo,
      twoPlayerPartner: pu.twoPlayerPartner,
      device: pu.device,
      worstFail: lp.worstFail,
      worstFailDate: lp.worstFailDate,
      worstFailDateTimezone: lp.worstFailDateTimezone,
      visibility: lp.visibility,
      levelNotes: lp.levelNotes,
      userGddlTier: lp.userGddlTier,
    }
    const fields = diffCompletionFields(
      snapshot,
      row.data,
      (lp.level.coins ?? 0) > 0
    )
    if (fields.length === 0) continue

    completionConflicts.push({
      rowIndex: row.rowIndex,
      levelId: row.data.levelId,
      levelName: lp.level.name,
      matchedId: null,
      fields,
    })
  }

  // Progress/Dropped: pre-checked via the derived-key path whenever the row
  // won't have a working explicit round-trip at commit time — no
  // progress_id/drop_id at all, OR one that doesn't resolve to an existing
  // entry for THIS user and level (foreign — e.g. copied from a different
  // account's export — or stale). An id that genuinely resolves round-trips
  // unconditionally (unrelated, unchanged path) and is excluded here; a
  // name-only row resolves its level too late for this pass either way
  // (falls back to the commit-time dedup in planProgress/planDrop instead).
  // Mirrors planProgress/planDrop's own `matched` check exactly, so a row
  // never gets a "no conflict" pre-check result that then behaves
  // differently at commit time.
  const explicitProgressIds = [
    ...new Set(
      (req.progress ?? []).flatMap((r) =>
        r.data.progressId ? [r.data.progressId] : []
      )
    ),
  ]
  const explicitDropIds = [
    ...new Set(
      (req.dropped ?? []).flatMap((r) => (r.data.dropId ? [r.data.dropId] : []))
    ),
  ]
  const [resolvableProgressRows, resolvableDropRows] = await Promise.all([
    explicitProgressIds.length
      ? prisma.progressUpdate.findMany({
          where: { id: { in: explicitProgressIds }, levelProgress: { userId } },
          select: { id: true, levelProgress: { select: { levelId: true } } },
        })
      : Promise.resolve([]),
    explicitDropIds.length
      ? prisma.progressUpdate.findMany({
          where: {
            id: { in: explicitDropIds },
            kind: 'DROP',
            levelProgress: { userId },
          },
          select: { id: true, levelProgress: { select: { levelId: true } } },
        })
      : Promise.resolve([]),
  ])
  const resolvableProgress = new Map(
    resolvableProgressRows.map((r) => [r.id, r.levelProgress.levelId])
  )
  const resolvableDrops = new Map(
    resolvableDropRows.map((r) => [r.id, r.levelProgress.levelId])
  )

  const progressRows = (req.progress ?? []).filter(
    (r) =>
      r.data.levelId &&
      (!r.data.progressId ||
        resolvableProgress.get(r.data.progressId) !== r.data.levelId)
  )
  const droppedRows = (req.dropped ?? []).filter(
    (r) =>
      r.data.levelId &&
      (!r.data.dropId || resolvableDrops.get(r.data.dropId) !== r.data.levelId)
  )
  const progressLevelIds = [
    ...new Set(progressRows.map((r) => r.data.levelId!)),
  ]
  const droppedLevelIds = [...new Set(droppedRows.map((r) => r.data.levelId!))]

  const [progressEvents, dropEvents] = await Promise.all([
    fetchExistingEvents(userId, 'PROGRESS', progressLevelIds),
    fetchExistingEvents(userId, 'DROP', droppedLevelIds),
  ])
  const progressEventsByLevel = groupByLevel(progressEvents)
  const dropEventsByLevel = groupByLevel(dropEvents)

  const { conflicts: progressConflicts, duplicates: progressDuplicates } =
    scanForConflicts(progressRows, progressEventsByLevel, {
      keyOf: (row) =>
        deriveEventKey({
          date: row.data.date ?? null,
          percentage: row.data.percentage ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        }),
      diffOf: (existing, row) => diffProgressFields(existing, row.data),
    })

  const { conflicts: droppedConflicts, duplicates: droppedDuplicates } =
    scanForConflicts(droppedRows, dropEventsByLevel, {
      keyOf: (row) =>
        deriveEventKey({
          date: row.data.droppedAt ?? null,
          percentage: row.data.bestProgress ?? null,
          runFrom: row.data.runFrom ?? null,
          runTo: row.data.runTo ?? null,
        }),
      diffOf: (existing, row) => diffDroppedFields(existing, row.data),
    })

  const [ratingConflicts, collectionsMerge, rankingMerge] = await Promise.all([
    checkRatingConflicts(userId, req.ratings ?? []),
    checkCollectionsMerge(userId, req.collections ?? []),
    checkRankingMerge(userId, req.ranking ?? []),
  ])

  return {
    completionConflicts,
    progressConflicts,
    progressDuplicates,
    droppedConflicts,
    droppedDuplicates,
    ratingConflicts,
    collectionsMerge,
    rankingMerge,
  }
}
