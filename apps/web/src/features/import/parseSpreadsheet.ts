// Client-side spreadsheet parsing + validation.
//
// The client owns date interpretation (the server trusts ISO strings).
// SheetJS parses the xlsx; this module normalizes column names,
// interprets dates per the user's selected format, flags problems,
// and returns structured rows ready to send to the API.

import * as XLSX from 'xlsx'
import type {
  ImportCompletionRow,
  ImportDroppedRow,
  DifficultyOpinion,
  Device,
  EntryVisibility,
} from '@/lib/api/import'

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

// Parses a percentage cell, tolerating a trailing "%" (e.g. "67%" → 67, "88 %"
// → 88). Returns null for empty cells and for values that still aren't numeric
// after stripping the sign (callers flag those so the user is told, rather than
// silently dropping the value).
function toPercent(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).trim().replace(/%\s*$/, '').trim()
  if (s === '') return null
  const n = Number(s)
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
  // Human-friendly row identity for display — the level name when present,
  // else the level ID, else the spreadsheet row number. Set once per row.
  rowLabel: string
  field: string
  message: string
  // 'error'  — the row cannot be imported at all (skipped).
  // 'warning' — the flagged value is dropped but the rest of the row imports.
  severity: 'error' | 'warning'
}

// Identifies a row to the user by the most recognizable thing available:
// its level name, then its ID, then the spreadsheet row number (1-based, with
// the header as row 1 — so a 0-based rowIndex maps to rowIndex + 2).
function rowLabelFor(
  levelName: string | null,
  levelId: string | null,
  rowIndex: number
): string {
  if (levelName) return levelName
  if (levelId) return `level ${levelId}`
  return `row ${rowIndex + 2}`
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
  const label = rowLabelFor(levelName, levelId, rowIndex)
  const pushFlag = (field: string, message: string, severity: 'error' | 'warning') =>
    flags.push({ rowIndex, rowLabel: label, field, message, severity })

  let validLevelId: string | null = null
  if (levelId && /^\d+$/.test(levelId)) {
    validLevelId = levelId
  } else if (levelId) {
    // A non-numeric level_id is bad data, but if there's a name we can still
    // resolve the level from it — warn and keep the row.
    if (levelName)
      pushFlag('level_id', `level_id "${levelId}" isn't numeric — resolving by name instead`, 'warning')
    else
      pushFlag('level_id', `level_id "${levelId}" isn't numeric and no level_name given — row cannot be imported`, 'error')
  } else if (levelName) {
    pushFlag('level_id', 'No level_id — will be resolved from level_name during import', 'warning')
  } else {
    pushFlag('level_id', 'Missing level_id and level_name — row cannot be imported', 'error')
  }

  // Date — a bad date is dropped; the rest of the row still imports.
  const rawDate = getField(raw, 'date')
  const dateResult = parseDate(rawDate, dateFormat)
  if (!dateResult.ok) pushFlag('date', `${dateResult.reason} — value dropped`, 'warning')

  // Attempts field — non-numeric like "~10000" is dropped with a warning.
  const rawAttempts = getField(raw, 'attempts')
  const attempts = toNum(rawAttempts)
  if (rawAttempts != null && rawAttempts !== '' && attempts === null)
    pushFlag('attempts', `attempts "${rawAttempts}" isn't a valid number — value dropped`, 'warning')

  // Percentage (worst fail) 0-100 — tolerate a trailing "%".
  const rawPercentage = getField(raw, 'percentage')
  const percentage = toPercent(rawPercentage)
  if (rawPercentage != null && rawPercentage !== '' && percentage === null)
    pushFlag('percentage', `percentage "${rawPercentage}" isn't a valid number — value dropped`, 'warning')
  else if (percentage != null && (percentage < 0 || percentage > 100))
    pushFlag('percentage', `percentage ${percentage} is outside 0-100 — value dropped`, 'warning')

  // Run range — tolerate a trailing "%".
  const rawRunFrom = getField(raw, 'run_from')
  const rawRunTo = getField(raw, 'run_to')
  const runFrom = toPercent(rawRunFrom)
  const runTo = toPercent(rawRunTo)
  if (rawRunFrom != null && rawRunFrom !== '' && runFrom === null)
    pushFlag('run_from', `run_from "${rawRunFrom}" isn't a valid number — value dropped`, 'warning')
  else if (runFrom != null && (runFrom < 0 || runFrom > 100))
    pushFlag('run_from', `run_from ${runFrom} is outside 0-100 — value dropped`, 'warning')
  if (rawRunTo != null && rawRunTo !== '' && runTo === null)
    pushFlag('run_to', `run_to "${rawRunTo}" isn't a valid number — value dropped`, 'warning')
  else if (runTo != null && (runTo < 0 || runTo > 100))
    pushFlag('run_to', `run_to ${runTo} is outside 0-100 — value dropped`, 'warning')

  // Ratings 0-10
  const enjoyment = toNum(getField(raw, 'enjoyment'))
  const simpleRating = toNum(getField(raw, 'simple_rating'))
  if (enjoyment != null && (enjoyment < 0 || enjoyment > 10))
    pushFlag('enjoyment', `enjoyment ${enjoyment} is outside 0-10 — value dropped`, 'warning')
  if (simpleRating != null && (simpleRating < 0 || simpleRating > 10))
    pushFlag('simple_rating', `simple_rating ${simpleRating} is outside 0-10 — value dropped`, 'warning')

  // Difficulty opinion enum
  const rawDO = toStr(getField(raw, 'difficulty_opinion'))
  let difficultyOpinion: DifficultyOpinion | null = null
  if (rawDO) {
    const normalized = rawDO.toLowerCase().replace(/\s+/g, '_')
    if (VALID_DIFFICULTY_OPINIONS.has(normalized)) {
      difficultyOpinion = normalized.toUpperCase() as DifficultyOpinion
    } else {
      pushFlag('difficulty_opinion', `unknown difficulty_opinion "${rawDO}" — value dropped`, 'warning')
    }
  }

  // Non-demon star rating (1-9) — only meaningful with a not_demon_worthy opinion.
  const rawStars = getField(raw, 'difficulty_opinion_stars')
  const difficultyOpinionStars = toNum(rawStars)
  if (rawStars != null && rawStars !== '' && difficultyOpinionStars === null)
    pushFlag('difficulty_opinion_stars', `difficulty_opinion_stars "${rawStars}" isn't a valid number — value dropped`, 'warning')
  else if (difficultyOpinionStars != null && (difficultyOpinionStars < 1 || difficultyOpinionStars > 9))
    pushFlag('difficulty_opinion_stars', `difficulty_opinion_stars ${difficultyOpinionStars} is outside 1-9 — value dropped`, 'warning')

  // Coins — three booleans (coin_1..coin_3) folded into a bitmask (bit 0 =
  // coin 1). Null when the row specifies none; levels without user coins ignore
  // this server-side.
  const coin1 = toBool(getField(raw, 'coin_1'))
  const coin2 = toBool(getField(raw, 'coin_2'))
  const coin3 = toBool(getField(raw, 'coin_3'))
  const coinsCollected =
    coin1 != null || coin2 != null || coin3 != null
      ? (coin1 ? 1 : 0) | (coin2 ? 2 : 0) | (coin3 ? 4 : 0)
      : null

  // Device beaten on — 'pc' or 'mobile'.
  const rawDevice = toStr(getField(raw, 'device'))
  let device: Device | null = null
  if (rawDevice) {
    const d = rawDevice.toLowerCase()
    if (d === 'pc' || d === 'mobile') device = d
    else pushFlag('device', `unknown device "${rawDevice}" (use pc or mobile) — value dropped`, 'warning')
  }

  // Per-entry privacy — 'public' or 'private'.
  const rawVisibility = toStr(getField(raw, 'visibility'))
  let visibility: EntryVisibility | null = null
  if (rawVisibility) {
    const v = rawVisibility.toLowerCase()
    if (v === 'public') visibility = 'PUBLIC'
    else if (v === 'private') visibility = 'PRIVATE'
    else pushFlag('visibility', `unknown visibility "${rawVisibility}" (use public or private) — value dropped`, 'warning')
  }

  const data: ImportCompletionRow = {
    levelId: validLevelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    date: dateResult.ok && dateResult.iso ? dateResult.iso : null,
    // Null (not false) when the column is absent, so an overwrite import only
    // touches booleans the spreadsheet actually specifies.
    dateUncertain: toBool(getField(raw, 'date_uncertain')),
    attempts: attempts != null && attempts >= 0 ? Math.round(attempts) : null,
    percentage: percentage != null && percentage >= 0 && percentage <= 100 ? percentage : null,
    runFrom: runFrom != null && runFrom >= 0 && runFrom <= 100 ? Math.round(runFrom) : null,
    runTo: runTo != null && runTo >= 0 && runTo <= 100 ? Math.round(runTo) : null,
    onStream: toBool(getField(raw, 'on_stream')),
    fps: toNum(getField(raw, 'fps')) != null ? Math.round(toNum(getField(raw, 'fps'))!) : null,
    enjoyment: enjoyment != null && enjoyment >= 0 && enjoyment <= 10 ? enjoyment : null,
    simpleRating: simpleRating != null && simpleRating >= 0 && simpleRating <= 10 ? simpleRating : null,
    difficultyOpinion,
    difficultyOpinionStars:
      difficultyOpinionStars != null && difficultyOpinionStars >= 1 && difficultyOpinionStars <= 9
        ? Math.round(difficultyOpinionStars)
        : null,
    coinsCollected,
    twoPlayerSolo: toBool(getField(raw, 'two_player_solo')),
    twoPlayerPartner: toStr(getField(raw, 'two_player_partner')),
    device,
    visibility,
    levelNotes: toStr(getField(raw, 'level_notes')),
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
  const label = rowLabelFor(levelName, levelId, rowIndex)
  const pushFlag = (field: string, message: string, severity: 'error' | 'warning') =>
    flags.push({ rowIndex, rowLabel: label, field, message, severity })

  let validLevelId: string | null = null
  if (levelId && /^\d+$/.test(levelId)) {
    validLevelId = levelId
  } else if (levelId) {
    if (levelName)
      pushFlag('level_id', `level_id "${levelId}" isn't numeric — resolving by name instead`, 'warning')
    else
      pushFlag('level_id', `level_id "${levelId}" isn't numeric and no level_name given — row cannot be imported`, 'error')
  } else if (levelName) {
    pushFlag('level_id', 'No level_id — will be resolved from level_name during import', 'warning')
  } else {
    pushFlag('level_id', 'Missing level_id and level_name — row cannot be imported', 'error')
  }

  const rawDate = getField(raw, 'dropped_at')
  const dateResult = parseDate(rawDate, dateFormat)
  if (!dateResult.ok) pushFlag('dropped_at', `${dateResult.reason} — value dropped`, 'warning')

  const rawBestProgress = getField(raw, 'best_progress')
  const bestProgress = toPercent(rawBestProgress)
  if (rawBestProgress != null && rawBestProgress !== '' && bestProgress === null)
    pushFlag('best_progress', `best_progress "${rawBestProgress}" isn't a valid number — value dropped`, 'warning')
  else if (bestProgress != null && (bestProgress < 0 || bestProgress > 100))
    pushFlag('best_progress', `best_progress ${bestProgress} is outside 0-100 — value dropped`, 'warning')

  const rawRunFrom = getField(raw, 'run_from')
  const rawRunTo = getField(raw, 'run_to')
  const runFrom = toPercent(rawRunFrom)
  const runTo = toPercent(rawRunTo)
  if (rawRunFrom != null && rawRunFrom !== '' && runFrom === null)
    pushFlag('run_from', `run_from "${rawRunFrom}" isn't a valid number — value dropped`, 'warning')
  else if (runFrom != null && (runFrom < 0 || runFrom > 100))
    pushFlag('run_from', `run_from ${runFrom} is outside 0-100 — value dropped`, 'warning')
  if (rawRunTo != null && rawRunTo !== '' && runTo === null)
    pushFlag('run_to', `run_to "${rawRunTo}" isn't a valid number — value dropped`, 'warning')
  else if (runTo != null && (runTo < 0 || runTo > 100))
    pushFlag('run_to', `run_to ${runTo} is outside 0-100 — value dropped`, 'warning')

  const rawAttempts = getField(raw, 'attempts_at_drop')
  const attemptsAtDrop = toNum(rawAttempts)
  if (rawAttempts != null && rawAttempts !== '' && attemptsAtDrop === null)
    pushFlag('attempts_at_drop', `attempts_at_drop "${rawAttempts}" isn't a valid number — value dropped`, 'warning')

  const data: ImportDroppedRow = {
    levelId: validLevelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    inGameDifficulty: toStr(getField(raw, 'in_game_difficulty')),
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
