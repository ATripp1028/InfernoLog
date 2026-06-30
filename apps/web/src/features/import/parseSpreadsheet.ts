// Client-side spreadsheet parsing + validation.
//
// The client owns date interpretation (the server trusts ISO strings).
// SheetJS parses the xlsx; this module normalizes column names,
// interprets dates per the user's selected format, flags problems,
// and returns structured rows ready to send to the API.

import * as XLSX from 'xlsx'
import type { ImportCompletionRow, ImportDroppedRow, DifficultyOpinion } from '@/lib/api/import'

// ── Date format ────────────────────────────────────────────────────────────

export type DateFormat = 'MDY' | 'DMY' | 'YMD' | 'ISO'

// Result of parsing a single date cell.
type DateParseResult =
  | { ok: true; iso: string }
  | { ok: false; reason: string; value: string }

function normalizeYear(y: number): number {
  // Two-digit year → 2000s (GD released 2013; no valid dates before that).
  return y < 100 ? 2000 + y : y
}

function parseDate(raw: unknown, format: DateFormat): DateParseResult {
  if (raw == null || raw === '') return { ok: true, iso: '' }

  // SheetJS may return a JS Date for cells formatted as dates.
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { ok: false, reason: 'Unparseable date', value: String(raw) }
    return { ok: true, iso: raw.toISOString().slice(0, 10) }
  }

  const s = String(raw).trim()
  if (!s) return { ok: true, iso: '' }

  // Phrase dates (e.g. "April 5th 2019", "early 2019").
  if (/[a-zA-Z]/.test(s)) {
    return { ok: false, reason: `Phrase date "${s}" — use ${format} format`, value: s }
  }

  // Normalize separators: allow dashes or slashes interchangeably.
  const normalized = s.replace(/[-/]/g, '/')
  const parts = normalized.split('/')
  if (parts.length !== 3) {
    return { ok: false, reason: `Unparseable date "${s}"`, value: s }
  }

  let y: number, m: number, d: number

  const nums = parts.map(Number)
  if (format === 'MDY') {
    m = nums[0]!; d = nums[1]!; y = nums[2]!
  } else if (format === 'DMY') {
    d = nums[0]!; m = nums[1]!; y = nums[2]!
  } else if (format === 'YMD' || format === 'ISO') {
    y = nums[0]!; m = nums[1]!; d = nums[2]!
  } else {
    m = nums[0]!; d = nums[1]!; y = nums[2]!
  }

  y = normalizeYear(y)

  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) {
    return { ok: false, reason: `Unparseable date "${s}"`, value: s }
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return { ok: false, reason: `Invalid date "${s}"`, value: s }
  }

  const iso =`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  // Quick sanity check via Date.
  const test = new Date(iso)
  if (isNaN(test.getTime())) {
    return { ok: false, reason: `Invalid date "${s}"`, value: s }
  }

  return { ok: true, iso }
}

// ── Column name normalisation ──────────────────────────────────────────────

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s_-]+/g, '_').trim()
}

function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const norm = normalizeKey(key)
    for (const [k, v] of Object.entries(row)) {
      if (normalizeKey(k) === norm) return v
    }
  }
  return undefined
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function toBool(v: unknown): boolean | null {
  if (v == null || v === '') return null
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase().trim()
  if (s === 'true' || s === '1' || s === 'yes') return true
  if (s === 'false' || s === '0' || s === 'no') return false
  return null
}

function toStr(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v).trim() || null
}

// ── Validation flags ───────────────────────────────────────────────────────

export interface ParseFlag {
  rowIndex: number    // 0-based within the tab
  field: string
  message: string
  severity: 'error' | 'warning'
}

export interface ParsedCompletionRow {
  rowIndex: number
  data: ImportCompletionRow
  flags: ParseFlag[]
}

export interface ParsedDroppedRow {
  rowIndex: number
  data: ImportDroppedRow
  flags: ParseFlag[]
}

export interface ParseResult {
  completions: ParsedCompletionRow[]
  dropped: ParsedDroppedRow[]
  /** Duplicate level IDs within a tab (flagged but not removed). */
  duplicateLevelIds: { tab: 'completions' | 'dropped'; levelId: string; rows: number[] }[]
}

// ── Completions tab ────────────────────────────────────────────────────────

const VALID_DIFFICULTY_OPINIONS = new Set<string>([
  'not_demon_worthy', 'easy', 'medium', 'hard', 'insane', 'extreme',
])

function parseCompletionRow(
  raw: Record<string, unknown>,
  rowIndex: number,
  dateFormat: DateFormat
): ParsedCompletionRow {
  const flags: ParseFlag[] = []

  const levelId = toStr(getField(raw, 'level_id'))
  const levelName = toStr(getField(raw, 'level_name'))

  let validLevelId: string | null = null
  if (levelId) {
    if (/^\d+$/.test(levelId)) {
      validLevelId = levelId
    } else {
      flags.push({ rowIndex, field: 'level_id', message: `level_id "${levelId}" must be numeric`, severity: 'error' })
    }
  }
  if (!validLevelId) {
    if (levelName) {
      flags.push({ rowIndex, field: 'level_id', message: 'No level_id — will be resolved from level_name during import', severity: 'warning' })
    } else {
      flags.push({ rowIndex, field: 'level_id', message: 'Missing level_id and level_name — row cannot be imported', severity: 'error' })
    }
  }

  // Date
  const rawDate = getField(raw, 'date')
  const dateResult = parseDate(rawDate, dateFormat)
  if (!dateResult.ok) {
    flags.push({ rowIndex, field: 'date', message: dateResult.reason, severity: 'error' })
  }

  // Attempts field — flag non-numeric like "~10000"
  const rawAttempts = getField(raw, 'attempts')
  const attempts = toNum(rawAttempts)
  if (rawAttempts != null && rawAttempts !== '' && attempts === null) {
    flags.push({ rowIndex, field: 'attempts', message: `Attempts "${rawAttempts}" contains non-numeric characters`, severity: 'error' })
  }

  // Percentage (worst fail) 0-100
  const percentage = toNum(getField(raw, 'percentage'))
  if (percentage != null && (percentage < 0 || percentage > 100)) {
    flags.push({ rowIndex, field: 'percentage', message: `Percentage ${percentage} is outside 0-100`, severity: 'error' })
  }

  // Run range
  const runFrom = toNum(getField(raw, 'run_from'))
  const runTo = toNum(getField(raw, 'run_to'))
  if (runFrom != null && (runFrom < 0 || runFrom > 100))
    flags.push({ rowIndex, field: 'run_from', message: `run_from ${runFrom} is outside 0-100`, severity: 'error' })
  if (runTo != null && (runTo < 0 || runTo > 100))
    flags.push({ rowIndex, field: 'run_to', message: `run_to ${runTo} is outside 0-100`, severity: 'error' })

  // Ratings 0-10
  const enjoyment = toNum(getField(raw, 'enjoyment'))
  const simpleRating = toNum(getField(raw, 'simple_rating'))
  if (enjoyment != null && (enjoyment < 0 || enjoyment > 10))
    flags.push({ rowIndex, field: 'enjoyment', message: `enjoyment ${enjoyment} is outside 0-10`, severity: 'error' })
  if (simpleRating != null && (simpleRating < 0 || simpleRating > 10))
    flags.push({ rowIndex, field: 'simple_rating', message: `simple_rating ${simpleRating} is outside 0-10`, severity: 'error' })

  // Difficulty opinion enum
  const rawDO = toStr(getField(raw, 'difficulty_opinion'))
  let difficultyOpinion: DifficultyOpinion | null = null
  if (rawDO) {
    const normalized = rawDO.toLowerCase().replace(/\s+/g, '_')
    if (VALID_DIFFICULTY_OPINIONS.has(normalized)) {
      difficultyOpinion = normalized.toUpperCase() as DifficultyOpinion
    } else {
      flags.push({ rowIndex, field: 'difficulty_opinion', message: `Unknown difficulty_opinion "${rawDO}"`, severity: 'error' })
    }
  }

  const data: ImportCompletionRow = {
    levelId: validLevelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    date: dateResult.ok && dateResult.iso ? dateResult.iso : null,
    dateUncertain: toBool(getField(raw, 'date_uncertain')) ?? false,
    attempts: attempts != null && attempts >= 0 ? Math.round(attempts) : null,
    percentage: percentage != null && percentage >= 0 && percentage <= 100 ? percentage : null,
    runFrom: runFrom != null && runFrom >= 0 && runFrom <= 100 ? Math.round(runFrom) : null,
    runTo: runTo != null && runTo >= 0 && runTo <= 100 ? Math.round(runTo) : null,
    onStream: toBool(getField(raw, 'on_stream')) ?? false,
    fps: toNum(getField(raw, 'fps')) != null ? Math.round(toNum(getField(raw, 'fps'))!) : null,
    enjoyment: enjoyment != null && enjoyment >= 0 && enjoyment <= 10 ? enjoyment : null,
    simpleRating: simpleRating != null && simpleRating >= 0 && simpleRating <= 10 ? simpleRating : null,
    difficultyOpinion,
    inGameDifficulty: toStr(getField(raw, 'in_game_difficulty')),
    gddlTier: toNum(getField(raw, 'gddl_tier')),
    nlwTier: toStr(getField(raw, 'nlw_tier')),
    notes: toStr(getField(raw, 'notes')),
    videoUrl: toStr(getField(raw, 'video_url')),
    highlightUrl: toStr(getField(raw, 'highlight_url')),
  }

  return { rowIndex, data, flags }
}

// ── Dropped tab ────────────────────────────────────────────────────────────

function parseDroppedRow(
  raw: Record<string, unknown>,
  rowIndex: number,
  dateFormat: DateFormat
): ParsedDroppedRow {
  const flags: ParseFlag[] = []

  const levelId = toStr(getField(raw, 'level_id'))
  const levelName = toStr(getField(raw, 'level_name'))

  let validLevelId: string | null = null
  if (levelId) {
    if (/^\d+$/.test(levelId)) {
      validLevelId = levelId
    } else {
      flags.push({ rowIndex, field: 'level_id', message: `level_id "${levelId}" must be numeric`, severity: 'error' })
    }
  }
  if (!validLevelId) {
    if (levelName) {
      flags.push({ rowIndex, field: 'level_id', message: 'No level_id — will be resolved from level_name during import', severity: 'warning' })
    } else {
      flags.push({ rowIndex, field: 'level_id', message: 'Missing level_id and level_name — row cannot be imported', severity: 'error' })
    }
  }

  const rawDate = getField(raw, 'dropped_at')
  const dateResult = parseDate(rawDate, dateFormat)
  if (!dateResult.ok) {
    flags.push({ rowIndex, field: 'dropped_at', message: dateResult.reason, severity: 'error' })
  }

  const bestProgress = toNum(getField(raw, 'best_progress'))
  if (bestProgress != null && (bestProgress < 0 || bestProgress > 100))
    flags.push({ rowIndex, field: 'best_progress', message: `best_progress ${bestProgress} is outside 0-100`, severity: 'error' })

  const runFrom = toNum(getField(raw, 'run_from'))
  const runTo = toNum(getField(raw, 'run_to'))
  if (runFrom != null && (runFrom < 0 || runFrom > 100))
    flags.push({ rowIndex, field: 'run_from', message: `run_from ${runFrom} is outside 0-100`, severity: 'error' })
  if (runTo != null && (runTo < 0 || runTo > 100))
    flags.push({ rowIndex, field: 'run_to', message: `run_to ${runTo} is outside 0-100`, severity: 'error' })

  const rawAttempts = getField(raw, 'attempts_at_drop')
  const attemptsAtDrop = toNum(rawAttempts)
  if (rawAttempts != null && rawAttempts !== '' && attemptsAtDrop === null) {
    flags.push({ rowIndex, field: 'attempts_at_drop', message: `attempts_at_drop "${rawAttempts}" contains non-numeric characters`, severity: 'error' })
  }

  const data: ImportDroppedRow = {
    levelId: validLevelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    bestProgress: bestProgress != null && bestProgress >= 0 && bestProgress <= 100 ? bestProgress : null,
    runFrom: runFrom != null && runFrom >= 0 && runFrom <= 100 ? Math.round(runFrom) : null,
    runTo: runTo != null && runTo >= 0 && runTo <= 100 ? Math.round(runTo) : null,
    attemptsAtDrop: attemptsAtDrop != null && attemptsAtDrop >= 0 ? Math.round(attemptsAtDrop) : null,
    droppedAt: dateResult.ok && dateResult.iso ? dateResult.iso : null,
    reason: toStr(getField(raw, 'reason')),
    gddlTierAtDrop: toNum(getField(raw, 'gddl_tier_at_drop')),
  }

  return { rowIndex, data, flags }
}

// ── Main parse function ────────────────────────────────────────────────────

export function parseSpreadsheet(
  buffer: ArrayBuffer,
  dateFormat: DateFormat
): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  // Case-insensitive tab lookup.
  const findSheet = (name: string) =>
    wb.Sheets[
      wb.SheetNames.find((n) => n.toLowerCase() === name.toLowerCase()) ?? ''
    ]

  const completionSheet = findSheet('Completions')
  const droppedSheet = findSheet('Dropped')

  const rawCompletions: Record<string, unknown>[] = completionSheet
    ? XLSX.utils.sheet_to_json(completionSheet, { defval: null })
    : []
  const rawDropped: Record<string, unknown>[] = droppedSheet
    ? XLSX.utils.sheet_to_json(droppedSheet, { defval: null })
    : []

  const completions = rawCompletions.map((r, i) =>
    parseCompletionRow(r as Record<string, unknown>, i, dateFormat)
  )
  const dropped = rawDropped.map((r, i) =>
    parseDroppedRow(r as Record<string, unknown>, i, dateFormat)
  )

  // Detect intra-tab duplicate level IDs.
  const duplicateLevelIds: ParseResult['duplicateLevelIds'] = []

  const completionIdMap = new Map<string, number[]>()
  for (const row of completions) {
    if (!row.data.levelId) continue
    const existing = completionIdMap.get(row.data.levelId) ?? []
    existing.push(row.rowIndex)
    completionIdMap.set(row.data.levelId, existing)
  }
  for (const [levelId, rows] of completionIdMap) {
    if (rows.length > 1) duplicateLevelIds.push({ tab: 'completions', levelId, rows })
  }

  const droppedIdMap = new Map<string, number[]>()
  for (const row of dropped) {
    if (!row.data.levelId) continue
    const existing = droppedIdMap.get(row.data.levelId) ?? []
    existing.push(row.rowIndex)
    droppedIdMap.set(row.data.levelId, existing)
  }
  for (const [levelId, rows] of droppedIdMap) {
    if (rows.length > 1) duplicateLevelIds.push({ tab: 'dropped', levelId, rows })
  }

  return { completions, dropped, duplicateLevelIds }
}
