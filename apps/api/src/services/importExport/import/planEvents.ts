// Write planning, part 2 — progress and drop rows.
//
// These share an existing-event snapshot and matching rules that completions
// don't need: a progress/drop row is deduped against what is already logged
// for that level, so the same sheet imported twice is a no-op.

// Spreadsheet import service — commit logic for POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop
// writes, cross-tab reconciliation (completion + drop for same level),
// conflict resolution, idempotency via (importJobId, rowIndex) keys,
// name-based level resolution, and GDDL tier autofill.

import { randomUUID } from 'node:crypto'
import prisma from '../../../utils/prisma'
import type { Prisma } from '@prisma/client'
import type {
  ImportProgressRow,
  ImportDroppedRow,
  ImportConflictAction,
  ImportFieldDiff,
} from '@infernolog/core'
import { zonedDateString } from '../../../utils/timezone'
import { PlanCtx, applyLp, getLpPlan } from './planWrites'
import { toNum } from '../../../utils/decimal'

// ── Progress/Dropped shared helpers ─────────────────────────────────────────
//
// Progress and Dropped round-trip by an explicit progress_id/drop_id when
// present (the branches below keyed off `matched` — unrelated to conflict
// resolution, unchanged from before this rework). When absent, a row could
// still describe an event that already exists (an unmodified export missing
// its id column, or a hand-added duplicate) — silently creating a new entry
// every time would duplicate history on every reimport. The derived key is
// (date, percentage, runFrom, runTo): ALL must match exactly, including both
// sides being null — a 43-100 run and a flat 35% reading on the same day are
// different events, not the same one recorded two ways. This only runs as a
// commit-time fallback for rows /check couldn't pre-resolve (name-only rows
// resolve their level too late to be pre-checked) — see matchExistingEvent.

// `timezone` is the existing row's paired dateTimezone/worstFailDateTimezone
// column — null means no time-of-day was ever entered (date is midnight UTC,
// a raw slice is correct); non-null means the date must be read back through
// that zone to recover the calendar day the user actually entered, since the
// UTC calendar day can differ from it (see apps/api/src/utils/timezone.ts).
export const isoDate = (
  d: Date | null,
  timezone: string | null
): string | null => (d ? zonedDateString(d, timezone) : null)

export interface ExistingEventSnapshot {
  id: string
  levelId: string
  date: Date | null
  dateTimezone: string | null
  dateUncertain: boolean
  attempts: number | null
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  fps: number | null
  onStream: boolean
  highlightUrl: string | null
  notes: string | null
  enjoyment: number | null // internal 0-100
  device: string | null
}

// Batch-fetches every existing PROGRESS (resp. DROP) row for the given
// levels — both checkImportConflicts (pre-check) and processImportJobBatch
// (commit-time fallback) need the same shape, just at different call sites.
export async function fetchExistingEvents(
  userId: string,
  kind: 'PROGRESS' | 'DROP',
  levelIds: string[]
): Promise<ExistingEventSnapshot[]> {
  if (!levelIds.length) return []
  const rows = await prisma.progressUpdate.findMany({
    where: { kind, levelProgress: { userId, levelId: { in: levelIds } } },
    select: {
      id: true,
      date: true,
      dateTimezone: true,
      dateUncertain: true,
      attempts: true,
      percentage: true,
      runFrom: true,
      runTo: true,
      fps: true,
      onStream: true,
      highlightUrl: true,
      notes: true,
      enjoyment: true,
      device: true,
      levelProgress: { select: { levelId: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    levelId: r.levelProgress.levelId,
    date: r.date,
    dateTimezone: r.dateTimezone,
    dateUncertain: r.dateUncertain,
    attempts: r.attempts,
    percentage: toNum(r.percentage),
    runFrom: r.runFrom,
    runTo: r.runTo,
    fps: r.fps,
    onStream: r.onStream,
    highlightUrl: r.highlightUrl,
    notes: r.notes,
    enjoyment: r.enjoyment,
    device: r.device,
  }))
}

export function groupByLevel(
  events: ExistingEventSnapshot[]
): Map<string, ExistingEventSnapshot[]> {
  const byLevel = new Map<string, ExistingEventSnapshot[]>()
  for (const e of events) {
    const list = byLevel.get(e.levelId)
    if (list) list.push(e)
    else byLevel.set(e.levelId, [e])
  }
  return byLevel
}

// The derived key as a plain string, for both grouping (intra-batch
// supersession) and matching (against existing DB rows). A row with none of
// the four fields set carries no distinguishing session data — treated as
// "no key" so a batch of otherwise-blank rows never falsely supersedes or
// dedupes against each other.
export function deriveEventKey(fields: {
  date: string | null
  percentage: number | null
  runFrom: number | null
  runTo: number | null
}): string | null {
  if (
    fields.date == null &&
    fields.percentage == null &&
    fields.runFrom == null &&
    fields.runTo == null
  ) {
    return null
  }
  return `${fields.date ?? ''}|${fields.percentage ?? ''}|${fields.runFrom ?? ''}|${fields.runTo ?? ''}`
}

// A field is a diff only when the sheet actually provides a value (null
// means "left blank" — auto-resolves to the existing value) AND that value
// differs from what's already stored. Shared by every per-tab field-diff
// function below (progress/dropped/completion) — the skip rule itself never
// varies, only which fields get compared.
export function createFieldPusher(diffs: ImportFieldDiff[]) {
  return (field: string, existingValue: unknown, importedValue: unknown) => {
    if (importedValue == null) return
    if (importedValue === existingValue) return
    diffs.push({ field, existingValue, importedValue })
  }
}

export function diffProgressFields(
  existing: ExistingEventSnapshot,
  row: ImportProgressRow
): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = []
  const push = createFieldPusher(diffs)
  push('date', isoDate(existing.date, existing.dateTimezone), row.date ?? null)
  push('dateUncertain', existing.dateUncertain, row.dateUncertain ?? null)
  push('attempts', existing.attempts, row.attempts ?? null)
  push('percentage', existing.percentage, row.percentage ?? null)
  push('runFrom', existing.runFrom, row.runFrom ?? null)
  push('runTo', existing.runTo, row.runTo ?? null)
  push('fps', existing.fps, row.fps ?? null)
  push('onStream', existing.onStream, row.onStream ?? null)
  push('highlightUrl', existing.highlightUrl, row.highlightUrl ?? null)
  push('notes', existing.notes, row.notes ?? null)
  push(
    'enjoyment',
    existing.enjoyment != null ? existing.enjoyment / 10 : null,
    row.enjoyment ?? null
  )
  push('device', existing.device, row.device ?? null)
  return diffs
}

export function diffDroppedFields(
  existing: ExistingEventSnapshot,
  row: ImportDroppedRow
): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = []
  const push = createFieldPusher(diffs)
  push(
    'droppedAt',
    isoDate(existing.date, existing.dateTimezone),
    row.droppedAt ?? null
  )
  push('bestProgress', existing.percentage, row.bestProgress ?? null)
  push('runFrom', existing.runFrom, row.runFrom ?? null)
  push('runTo', existing.runTo, row.runTo ?? null)
  push('attemptsAtDrop', existing.attempts, row.attemptsAtDrop ?? null)
  push('reason', existing.notes, row.reason ?? null)
  return diffs
}

// Commit-time fallback dedup for a row with no explicit progress_id/drop_id.
// 'exact' — every field agrees, a true no-op duplicate. 'partial' — the
// derived key matched but something else differs (created anyway and
// flagged for review — see planProgress/planDrop). null — no match at all.
function matchExistingEvent(
  eventsByLevel: Map<string, ExistingEventSnapshot[]>,
  levelId: string,
  key: string | null,
  diff: (existing: ExistingEventSnapshot) => ImportFieldDiff[]
): 'exact' | 'partial' | null {
  if (key == null) return null
  const candidates = eventsByLevel.get(levelId)
  if (!candidates) return null
  // Scan every same-key candidate rather than stopping at the first: a level
  // can legitimately have more than one PROGRESS/DROP row sharing a derived
  // key (same date/percentage/run range, different notes/attempts), so
  // returning on the first match risked classifying a genuine exact
  // duplicate as merely 'partial' whenever a differing same-key row happened
  // to come back from the DB first (no ORDER BY guarantees that order).
  let sawPartial = false
  for (const existing of candidates) {
    const existingKey = deriveEventKey({
      date: isoDate(existing.date, existing.dateTimezone),
      percentage: existing.percentage,
      runFrom: existing.runFrom,
      runTo: existing.runTo,
    })
    if (existingKey !== key) continue
    if (diff(existing).length === 0) return 'exact'
    sawPartial = true
  }
  return sawPartial ? 'partial' : null
}

function eventOutcomeReason(
  outcomeStatus: 'committed' | 'updated' | 'skipped',
  resolution: ImportConflictAction | undefined
): string | undefined {
  if (outcomeStatus === 'skipped') {
    if (resolution === 'drop') return 'Discarded during conflict review'
    if (resolution === 'duplicate') return 'Duplicate of an existing entry'
    return undefined
  }
  if (outcomeStatus === 'updated') {
    if (resolution === 'overwrite') return 'Overwritten'
    if (resolution === 'merge') return 'Merged'
  }
  return undefined
}

interface EventPlanResult {
  status: 'committed' | 'updated' | 'skipped'
  reason?: string | undefined
  // A 'committed' row that's a possible (non-exact) duplicate the pre-check
  // couldn't catch — created anyway (never silently dropped — an incoming
  // row might genuinely be new data that happens to share a derived key) but
  // surfaced via the flagged-row review mechanism.
  flagged?: boolean
}

// Shared translation of matchExistingEvent's dedup verdict, used by both
// planDrop and planProgress's derived-key fallback path. 'exact' always
// skips before any write happens, so it's returned directly; 'partial'/null
// are resolved into a final result AFTER the caller performs its own write
// (the write itself is the only part that genuinely differs between a drop
// and a progress row, so it isn't folded into these helpers).
function exactDuplicateSkip(): EventPlanResult {
  return { status: 'skipped', reason: 'Duplicate of an existing entry' }
}

function committedDedupResult(
  dedup: 'partial' | null,
  possibleDuplicateReason: string
): EventPlanResult {
  return dedup === 'partial'
    ? { status: 'committed', reason: possibleDuplicateReason, flagged: true }
    : { status: 'committed' }
}

// A drop event, backed by its own progress_update (kind=DROP). Additive, like
// Progress — a level can be dropped more than once (drop → resume → drop
// again). Round-trips by `dropId` when present (unrelated to conflict
// resolution — the pre-existing, unchanged behavior); otherwise resolved via
// `resolution` (arrived from conflict review, matchedId already folded into
// `dropId` by the frontend) or the derived-key fallback dedup above.
export function planDrop(
  ctx: PlanCtx,
  levelId: string,
  row: ImportDroppedRow,
  resolution: ImportConflictAction | undefined
): EventPlanResult {
  if (resolution === 'drop' || resolution === 'duplicate') {
    return {
      status: 'skipped',
      reason: eventOutcomeReason('skipped', resolution),
    }
  }

  const matched = row.dropId ? ctx.existingDrops.get(row.dropId) : undefined
  const plan = getLpPlan(ctx, levelId)

  if (matched && matched.levelId === levelId) {
    if (resolution === 'overwrite') {
      const fields = {
        date: row.droppedAt ? new Date(row.droppedAt) : null,
        dateTimezone: null,
        attempts: row.attemptsAtDrop ?? null,
        notes: row.reason ?? null,
        percentage: row.bestProgress ?? null,
        runFrom: row.runFrom ?? null,
        runTo: row.runTo ?? null,
      }
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: fields })
      if (row.bestProgress != null) {
        applyLp(plan, { worstFail: Math.round(row.bestProgress) })
      }
      if (!plan.completed) applyLp(plan, { status: 'DROPPED' })
      return { status: 'updated', reason: 'Overwritten' }
    }

    // resolution === 'merge', or absent (ordinary id round-trip) — only the
    // fields the sheet provides are written, same shape either way.
    const merge: Prisma.ProgressUpdateUncheckedUpdateInput = {}
    if (row.droppedAt != null) {
      merge.date = new Date(row.droppedAt)
      merge.dateTimezone = null
    }
    if (row.attemptsAtDrop != null) merge.attempts = row.attemptsAtDrop
    if (row.reason != null) merge.notes = row.reason
    if (row.bestProgress != null) merge.percentage = row.bestProgress
    if (row.runFrom != null) merge.runFrom = row.runFrom
    if (row.runTo != null) merge.runTo = row.runTo
    if (Object.keys(merge).length > 0) {
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: merge })
    }
    if (row.bestProgress != null) {
      applyLp(plan, { worstFail: Math.round(row.bestProgress) })
    }
    if (!plan.completed) applyLp(plan, { status: 'DROPPED' })
    return {
      status: 'updated',
      reason: resolution === 'merge' ? 'Merged' : undefined,
    }
  }

  const key = deriveEventKey({
    date: row.droppedAt ?? null,
    percentage: row.bestProgress ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
  })
  const dedup = matchExistingEvent(ctx.dropEventsByLevel, levelId, key, (e) =>
    diffDroppedFields(e, row)
  )
  if (dedup === 'exact') return exactDuplicateSkip()

  const puId = randomUUID()
  ctx.writes.newProgressUpdates.push({
    id: puId,
    levelProgressId: plan.id,
    kind: 'DROP',
    date: row.droppedAt ? new Date(row.droppedAt) : null,
    dateTimezone: null,
    attempts: row.attemptsAtDrop ?? null,
    notes: row.reason ?? null,
    percentage: row.bestProgress ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
    inGameDifficulty: ctx.levelDiff.get(levelId) ?? null,
  })
  applyLp(plan, {
    status: plan.completed ? 'COMPLETED' : 'DROPPED',
    ...(row.bestProgress != null
      ? { worstFail: Math.round(row.bestProgress) }
      : {}),
  })
  return committedDedupResult(
    dedup,
    'Possible duplicate — re-import with a drop_id column to resolve automatically'
  )
}

// A non-completion progress log. Unlike completions/drops, many rows can
// legitimately target the same level (session history) — so there is no
// "existing entry" to skip or overwrite by level. Round-trips by
// `progressId` when present (unrelated to conflict resolution — the
// pre-existing, unchanged behavior); otherwise resolved via `resolution` or
// the derived-key fallback dedup above. Never touches LevelProgress.status —
// completions/drops establish status, and historical progress rows must not
// flip a dropped level back to in-progress on reimport.
export function planProgress(
  ctx: PlanCtx,
  levelId: string,
  row: ImportProgressRow,
  resolution: ImportConflictAction | undefined
): EventPlanResult {
  if (resolution === 'drop' || resolution === 'duplicate') {
    return {
      status: 'skipped',
      reason: eventOutcomeReason('skipped', resolution),
    }
  }

  const matched = row.progressId
    ? ctx.existingProgress.get(row.progressId)
    : undefined
  const plan = getLpPlan(ctx, levelId)

  if (matched && matched.levelId === levelId) {
    if (resolution === 'overwrite') {
      const fields = {
        date: row.date ? new Date(row.date) : null,
        dateTimezone: null,
        dateUncertain: row.dateUncertain ?? false,
        attempts: row.attempts ?? null,
        percentage: row.percentage ?? null,
        runFrom: row.runFrom ?? null,
        runTo: row.runTo ?? null,
        fps: row.fps ?? null,
        onStream: row.onStream ?? false,
        highlightUrl: row.highlightUrl ?? null,
        notes: row.notes ?? null,
        enjoyment:
          row.enjoyment != null ? Math.round(row.enjoyment * 10) : null,
        device: row.device ?? null,
      }
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: fields })
      if (row.visibility != null) applyLp(plan, { visibility: row.visibility })
      return { status: 'updated', reason: 'Overwritten' }
    }

    // resolution === 'merge', or absent (ordinary id round-trip) — only the
    // fields the sheet provides are written, same shape either way.
    const merge: Prisma.ProgressUpdateUncheckedUpdateInput = {}
    if (row.date != null) {
      merge.date = new Date(row.date)
      merge.dateTimezone = null
    }
    if (row.dateUncertain != null) merge.dateUncertain = row.dateUncertain
    if (row.attempts != null) merge.attempts = row.attempts
    if (row.percentage != null) merge.percentage = row.percentage
    if (row.runFrom != null) merge.runFrom = row.runFrom
    if (row.runTo != null) merge.runTo = row.runTo
    if (row.fps != null) merge.fps = row.fps
    if (row.onStream != null) merge.onStream = row.onStream
    if (row.highlightUrl != null) merge.highlightUrl = row.highlightUrl
    if (row.notes != null) merge.notes = row.notes
    if (row.enjoyment != null) merge.enjoyment = Math.round(row.enjoyment * 10)
    if (row.device != null) merge.device = row.device
    if (Object.keys(merge).length > 0) {
      ctx.writes.progressUpdateUpdates.push({ id: matched.id, data: merge })
    }
    if (row.visibility != null) applyLp(plan, { visibility: row.visibility })
    return {
      status: 'updated',
      reason: resolution === 'merge' ? 'Merged' : undefined,
    }
  }

  const key = deriveEventKey({
    date: row.date ?? null,
    percentage: row.percentage ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
  })
  const dedup = matchExistingEvent(
    ctx.progressEventsByLevel,
    levelId,
    key,
    (e) => diffProgressFields(e, row)
  )
  if (dedup === 'exact') return exactDuplicateSkip()

  const puId = randomUUID()
  ctx.writes.newProgressUpdates.push({
    id: puId,
    levelProgressId: plan.id,
    kind: 'PROGRESS',
    date: row.date ? new Date(row.date) : null,
    dateTimezone: null,
    dateUncertain: row.dateUncertain ?? false,
    attempts: row.attempts ?? null,
    percentage: row.percentage ?? null,
    runFrom: row.runFrom ?? null,
    runTo: row.runTo ?? null,
    fps: row.fps ?? null,
    onStream: row.onStream ?? false,
    highlightUrl: row.highlightUrl ?? null,
    notes: row.notes ?? null,
    enjoyment: row.enjoyment != null ? Math.round(row.enjoyment * 10) : null,
    device: row.device ?? null,
    inGameDifficulty: ctx.levelDiff.get(levelId) ?? null,
  })
  if (row.visibility != null) applyLp(plan, { visibility: row.visibility })
  return committedDedupResult(
    dedup,
    'Possible duplicate — re-import with a progress_id column to resolve automatically'
  )
}
