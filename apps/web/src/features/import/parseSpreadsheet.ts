// Client-side spreadsheet parsing + validation.
//
// The client owns date interpretation (the server trusts ISO strings).
// SheetJS parses the xlsx; this module normalizes column names,
// interprets dates per the user's selected format, flags problems,
// and returns structured rows ready to send to the API.

import * as XLSX from 'xlsx'
import type {
  ImportCompletionRow,
  ImportProgressRow,
  ImportDroppedRow,
} from '@/lib/api/import'
import type {
  DateFormatPreference,
  Device,
  DifficultyOpinion,
  EntryVisibility,
} from '@/lib/api/wireEnums'
import { STAR_TO_OPINION as SHARED_STAR_TO_OPINION } from '@infernolog/core'
import { coinMaskFromFlags } from '@/lib/coinBitmask'

/**
 * How dates in the uploaded sheet are ordered. The parser cannot infer this,
 * so the user states it on upload — seeded from their `dateFormatPreference`,
 * which is why this is that same union rather than a parallel one.
 */
export type DateFormat = DateFormatPreference

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
    if (isNaN(raw.getTime()))
      return { ok: false, reason: 'Unparseable date', value: String(raw) }
    // Excel dates are date-only; avoid timezone shifts by normalizing to a local YYYY-MM-DD.
    const local = new Date(raw.getTime() - raw.getTimezoneOffset() * 60_000)
    return { ok: true, iso: local.toISOString().slice(0, 10) }
  }

  const s = String(raw).trim()
  if (!s) return { ok: true, iso: '' }

  // Phrase dates (e.g. "April 5th 2019", "early 2019").
  if (/[a-zA-Z]/.test(s)) {
    return {
      ok: false,
      reason: `Phrase date "${s}" — use ${format} format`,
      value: s,
    }
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
    m = nums[0]!
    d = nums[1]!
    y = nums[2]!
  } else if (format === 'DMY') {
    d = nums[0]!
    m = nums[1]!
    y = nums[2]!
  } else if (format === 'YMD' || format === 'ISO') {
    y = nums[0]!
    m = nums[1]!
    d = nums[2]!
  } else {
    m = nums[0]!
    d = nums[1]!
    y = nums[2]!
  }

  y = normalizeYear(y)

  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) {
    return { ok: false, reason: `Unparseable date "${s}"`, value: s }
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return { ok: false, reason: `Invalid date "${s}"`, value: s }
  }

  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  // Quick sanity check via Date.
  const test = new Date(iso)
  if (isNaN(test.getTime())) {
    return { ok: false, reason: `Invalid date "${s}"`, value: s }
  }

  return { ok: true, iso }
}

// ── Column name normalisation ──────────────────────────────────────────────

// Collapses a header cell to a comparable snake_case key. Surrounding
// separators are stripped AFTER the collapse, not before: a trailing space is
// already a '_' by then, so trimming first (as this used to) left '_level_id_'
// and silently failed to match 'level_id' — which read as an absent column and
// failed the whole row. Excel does not render trailing spaces, so that was
// invisible to the user who authored the sheet.
function normalizeKey(k: string): string {
  return k
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
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

/**
 * One problem found while parsing a row.
 *
 * `severity` decides what happens to the row: `error` skips it entirely,
 * `warning` drops just the flagged value and imports the rest.
 */
export interface ParseFlag {
  rowIndex: number // 0-based within the tab
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

/**
 * One Completions row with the flags raised while parsing it.
 */
export interface ParsedCompletionRow {
  rowIndex: number
  data: ImportCompletionRow
  flags: ParseFlag[]
}

/**
 * One Dropped row with its flags.
 */
export interface ParsedDroppedRow {
  rowIndex: number
  data: ImportDroppedRow
  flags: ParseFlag[]
}

/**
 * One Progress row with its flags.
 */
export interface ParsedProgressRow {
  rowIndex: number
  data: ImportProgressRow
  flags: ParseFlag[]
}

/**
 * One Ranking row with its flags. Sheet order is authoritative; `rank` is only present when the sheet has a rank column.
 */
export interface ParsedRankingRow {
  rowIndex: number
  levelId: string | null
  levelName: string | null
  /** Explicit rank number, if the sheet has a rank column. */
  rank: number | null
  flags: ParseFlag[]
}

/**
 * One Lists row with its flags.
 */
export interface ParsedListRow {
  rowIndex: number
  list: string | null
  levelId: string | null
  levelName: string | null
  creator: string | null
  inGameDifficulty: string | null
  position: number | null
  flags: ParseFlag[]
}

/**
 * One Ratings row with its flags. Scores are keyed by category NAME — the sheet has no ids.
 */
export interface ParsedRatingRow {
  rowIndex: number
  levelId: string | null
  levelName: string | null
  creator: string | null
  inGameDifficulty: string | null
  /** Category name → score on the internal 0-100 scale. */
  scores: Record<string, number>
  /** SIMPLE mode's single score, internal 0-100. Null when the cell is blank. */
  simpleRating: number | null
  flags: ParseFlag[]
}

/**
 * Everything parsed out of the workbook, tab by tab, plus the cross-row duplicate report.
 */
export interface ParseResult {
  completions: ParsedCompletionRow[]
  /** Progress tab entries — non-completion session logs, unordered. */
  progress: ParsedProgressRow[]
  dropped: ParsedDroppedRow[]
  /** Ranking tab entries, ordered hardest → easiest (see parseSpreadsheet). */
  ranking: ParsedRankingRow[]
  /** Lists tab entries, in sheet row order (grouped/ordered server-side). */
  lists: ParsedListRow[]
  /** Ratings tab entries — one row per level, one score column per category. */
  ratings: ParsedRatingRow[]
  /** Category column names discovered in the Ratings tab, in sheet order. */
  ratingCategories: string[]
  /**
   * Ranking tab entries, ordered best → worst — the MANUAL rating order.
   * Parsed exactly like `ranking`, which is the same shape on the other axis.
   */
  ratingRanking: ParsedRankingRow[]
  /** Duplicate level IDs within a tab (flagged but not removed). */
  duplicateLevelIds: { tab: 'completions'; levelId: string; rows: number[] }[]
}

// ── Completions tab ────────────────────────────────────────────────────────

const VALID_DIFFICULTY_OPINIONS = new Set<string>([
  'not_demon_worthy',
  'easy',
  'medium',
  'hard',
  'insane',
  'extreme',
])

// The sheet keeps two user-facing columns (difficulty_opinion +
// difficulty_opinion_stars) for clarity, but the wire format merges them: the
// non-demon star values carry their own star count. Shared table, see
// packages/core/src/difficultyOpinion.ts.
const STAR_TO_OPINION = SHARED_STAR_TO_OPINION as Record<
  number,
  DifficultyOpinion
>

function parseCompletionRow(
  raw: Record<string, unknown>,
  rowIndex: number,
  dateFormat: DateFormat
): ParsedCompletionRow {
  const flags: ParseFlag[] = []

  const levelId = toStr(getField(raw, 'level_id'))
  const levelName = toStr(getField(raw, 'level_name'))
  const label = rowLabelFor(levelName, levelId, rowIndex)
  const pushFlag = (
    field: string,
    message: string,
    severity: 'error' | 'warning'
  ) => flags.push({ rowIndex, rowLabel: label, field, message, severity })

  let validLevelId: string | null = null
  if (levelId && /^\d+$/.test(levelId)) {
    validLevelId = levelId
  } else if (levelId) {
    // A non-numeric level_id is bad data, but if there's a name we can still
    // resolve the level from it — warn and keep the row.
    if (levelName)
      pushFlag(
        'level_id',
        `level_id "${levelId}" isn't numeric — resolving by name instead`,
        'warning'
      )
    else
      pushFlag(
        'level_id',
        `level_id "${levelId}" isn't numeric and no level_name given — row cannot be imported`,
        'error'
      )
  } else if (levelName) {
    pushFlag(
      'level_id',
      'No level_id — will be resolved from level_name during import',
      'warning'
    )
  } else {
    pushFlag(
      'level_id',
      'Missing level_id and level_name — row cannot be imported',
      'error'
    )
  }

  // Date — a bad date is dropped; the rest of the row still imports.
  const rawDate = getField(raw, 'date')
  const dateResult = parseDate(rawDate, dateFormat)
  if (!dateResult.ok)
    pushFlag('date', `${dateResult.reason} — value dropped`, 'warning')

  // Attempts field — non-numeric like "~10000" is dropped with a warning.
  const rawAttempts = getField(raw, 'attempts')
  const attempts = toNum(rawAttempts)
  if (rawAttempts != null && rawAttempts !== '' && attempts === null)
    pushFlag(
      'attempts',
      `attempts "${rawAttempts}" isn't a valid number — value dropped`,
      'warning'
    )

  // Percentage (worst fail) 0-100 — tolerate a trailing "%".
  const rawPercentage = getField(raw, 'percentage')
  const percentage = toPercent(rawPercentage)
  if (rawPercentage != null && rawPercentage !== '' && percentage === null)
    pushFlag(
      'percentage',
      `percentage "${rawPercentage}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (percentage != null && (percentage < 0 || percentage > 100))
    pushFlag(
      'percentage',
      `percentage ${percentage} is outside 0-100 — value dropped`,
      'warning'
    )

  // Run range — tolerate a trailing "%".
  const rawRunFrom = getField(raw, 'run_from')
  const rawRunTo = getField(raw, 'run_to')
  const runFrom = toPercent(rawRunFrom)
  const runTo = toPercent(rawRunTo)
  if (rawRunFrom != null && rawRunFrom !== '' && runFrom === null)
    pushFlag(
      'run_from',
      `run_from "${rawRunFrom}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (runFrom != null && (runFrom < 0 || runFrom > 100))
    pushFlag(
      'run_from',
      `run_from ${runFrom} is outside 0-100 — value dropped`,
      'warning'
    )
  if (rawRunTo != null && rawRunTo !== '' && runTo === null)
    pushFlag(
      'run_to',
      `run_to "${rawRunTo}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (runTo != null && (runTo < 0 || runTo > 100))
    pushFlag(
      'run_to',
      `run_to ${runTo} is outside 0-100 — value dropped`,
      'warning'
    )

  // Ratings 0-10
  const enjoyment = toNum(getField(raw, 'enjoyment'))
  const simpleRating = toNum(getField(raw, 'simple_rating'))
  if (enjoyment != null && (enjoyment < 0 || enjoyment > 10))
    pushFlag(
      'enjoyment',
      `enjoyment ${enjoyment} is outside 0-10 — value dropped`,
      'warning'
    )
  if (simpleRating != null && (simpleRating < 0 || simpleRating > 10))
    pushFlag(
      'simple_rating',
      `simple_rating ${simpleRating} is outside 0-10 — value dropped`,
      'warning'
    )

  // Difficulty opinion — the sheet keeps two columns (text opinion + a
  // separate star number for "not demon-worthy") but the wire format merges
  // them into one enum value.
  const rawDO = toStr(getField(raw, 'difficulty_opinion'))
  let rawOpinion: string | null = null
  if (rawDO) {
    const normalized = rawDO.toLowerCase().replace(/\s+/g, '_')
    if (VALID_DIFFICULTY_OPINIONS.has(normalized)) {
      rawOpinion = normalized
    } else {
      pushFlag(
        'difficulty_opinion',
        `unknown difficulty_opinion "${rawDO}" — value dropped`,
        'warning'
      )
    }
  }

  // Non-demon star rating (1-9) — only meaningful with a not_demon_worthy opinion.
  const rawStars = getField(raw, 'difficulty_opinion_stars')
  const difficultyOpinionStars = toNum(rawStars)
  if (rawStars != null && rawStars !== '' && difficultyOpinionStars === null)
    pushFlag(
      'difficulty_opinion_stars',
      `difficulty_opinion_stars "${rawStars}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (
    difficultyOpinionStars != null &&
    (difficultyOpinionStars < 1 || difficultyOpinionStars > 9)
  )
    pushFlag(
      'difficulty_opinion_stars',
      `difficulty_opinion_stars ${difficultyOpinionStars} is outside 1-9 — value dropped`,
      'warning'
    )

  const validStars =
    difficultyOpinionStars != null &&
    difficultyOpinionStars >= 1 &&
    difficultyOpinionStars <= 9
      ? Math.round(difficultyOpinionStars)
      : null

  // "not demon-worthy" has no bare enum value — it always resolves to a
  // concrete star count, and with nothing to go on that means AUTO (1 star).
  // That is a guess at the user's own opinion, so it is never applied silently:
  // otherwise the row lands as "1★ Auto" with nothing on screen to say the
  // sheet never claimed that. Covers both a blank column and one whose value
  // was dropped above — they reach the same default, and "value dropped"
  // doesn't say what replaced it.
  if (rawOpinion === 'not_demon_worthy' && validStars == null)
    pushFlag(
      'difficulty_opinion_stars',
      `difficulty_opinion is "not_demon_worthy" with no usable difficulty_opinion_stars — recorded as 1★ Auto. Set it to 1-9 to say which.`,
      'warning'
    )

  const difficultyOpinion: DifficultyOpinion | null =
    rawOpinion == null
      ? null
      : rawOpinion === 'not_demon_worthy'
        ? STAR_TO_OPINION[validStars ?? 1]!
        : (rawOpinion.toUpperCase() as DifficultyOpinion)

  // Coins — three booleans (coin_1..coin_3) folded into a bitmask (bit 0 =
  // coin 1). Null when the row specifies none; levels without user coins ignore
  // this server-side.
  const coin1 = toBool(getField(raw, 'coin_1'))
  const coin2 = toBool(getField(raw, 'coin_2'))
  const coin3 = toBool(getField(raw, 'coin_3'))
  const coinsCollected = coinMaskFromFlags([coin1, coin2, coin3])

  // Device beaten on — 'pc' or 'mobile'.
  const rawDevice = toStr(getField(raw, 'device'))
  let device: Device | null = null
  if (rawDevice) {
    const d = rawDevice.toLowerCase()
    if (d === 'pc' || d === 'mobile') device = d
    else
      pushFlag(
        'device',
        `unknown device "${rawDevice}" (use pc or mobile) — value dropped`,
        'warning'
      )
  }

  // Per-entry privacy — 'public' or 'private'.
  const rawVisibility = toStr(getField(raw, 'visibility'))
  let visibility: EntryVisibility | null = null
  if (rawVisibility) {
    const v = rawVisibility.toLowerCase()
    if (v === 'public') visibility = 'PUBLIC'
    else if (v === 'private') visibility = 'PRIVATE'
    else
      pushFlag(
        'visibility',
        `unknown visibility "${rawVisibility}" (use public or private) — value dropped`,
        'warning'
      )
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
    percentage:
      percentage != null && percentage >= 0 && percentage <= 100
        ? percentage
        : null,
    runFrom:
      runFrom != null && runFrom >= 0 && runFrom <= 100
        ? Math.round(runFrom)
        : null,
    runTo:
      runTo != null && runTo >= 0 && runTo <= 100 ? Math.round(runTo) : null,
    onStream: toBool(getField(raw, 'on_stream')),
    fps:
      toNum(getField(raw, 'fps')) != null
        ? Math.round(toNum(getField(raw, 'fps'))!)
        : null,
    enjoyment:
      enjoyment != null && enjoyment >= 0 && enjoyment <= 10 ? enjoyment : null,
    simpleRating:
      simpleRating != null && simpleRating >= 0 && simpleRating <= 10
        ? simpleRating
        : null,
    difficultyOpinion,
    coinsCollected,
    twoPlayerSolo: toBool(getField(raw, 'two_player_solo')),
    twoPlayerPartner: toStr(getField(raw, 'two_player_partner')),
    device,
    visibility,
    levelNotes: toStr(getField(raw, 'level_notes')),
    inGameDifficulty: toStr(getField(raw, 'in_game_difficulty')),
    userGddlTier: toNum(getField(raw, 'gddl_tier')),
    notes: toStr(getField(raw, 'notes')),
    videoUrl: toStr(getField(raw, 'video_url')),
    highlightUrl: toStr(getField(raw, 'highlight_url')),
  }

  return { rowIndex, data, flags }
}

// ── Progress tab ───────────────────────────────────────────────────────────

function parseProgressRow(
  raw: Record<string, unknown>,
  rowIndex: number,
  dateFormat: DateFormat
): ParsedProgressRow {
  const flags: ParseFlag[] = []

  const levelId = toStr(getField(raw, 'level_id'))
  const levelName = toStr(getField(raw, 'level_name'))
  const label = rowLabelFor(levelName, levelId, rowIndex)
  const pushFlag = (
    field: string,
    message: string,
    severity: 'error' | 'warning'
  ) => flags.push({ rowIndex, rowLabel: label, field, message, severity })

  let validLevelId: string | null = null
  if (levelId && /^\d+$/.test(levelId)) {
    validLevelId = levelId
  } else if (levelId) {
    if (levelName)
      pushFlag(
        'level_id',
        `level_id "${levelId}" isn't numeric — resolving by name instead`,
        'warning'
      )
    else
      pushFlag(
        'level_id',
        `level_id "${levelId}" isn't numeric and no level_name given — row cannot be imported`,
        'error'
      )
  } else if (levelName) {
    pushFlag(
      'level_id',
      'No level_id — will be resolved from level_name during import',
      'warning'
    )
  } else {
    pushFlag(
      'level_id',
      'Missing level_id and level_name — row cannot be imported',
      'error'
    )
  }

  const rawDate = getField(raw, 'date')
  const dateResult = parseDate(rawDate, dateFormat)
  if (!dateResult.ok)
    pushFlag('date', `${dateResult.reason} — value dropped`, 'warning')

  const rawAttempts = getField(raw, 'attempts')
  const attempts = toNum(rawAttempts)
  if (rawAttempts != null && rawAttempts !== '' && attempts === null)
    pushFlag(
      'attempts',
      `attempts "${rawAttempts}" isn't a valid number — value dropped`,
      'warning'
    )

  const rawPercentage = getField(raw, 'percentage')
  const percentage = toPercent(rawPercentage)
  if (rawPercentage != null && rawPercentage !== '' && percentage === null)
    pushFlag(
      'percentage',
      `percentage "${rawPercentage}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (percentage != null && (percentage < 0 || percentage > 100))
    pushFlag(
      'percentage',
      `percentage ${percentage} is outside 0-100 — value dropped`,
      'warning'
    )

  const rawRunFrom = getField(raw, 'run_from')
  const rawRunTo = getField(raw, 'run_to')
  const runFrom = toPercent(rawRunFrom)
  const runTo = toPercent(rawRunTo)
  if (rawRunFrom != null && rawRunFrom !== '' && runFrom === null)
    pushFlag(
      'run_from',
      `run_from "${rawRunFrom}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (runFrom != null && (runFrom < 0 || runFrom > 100))
    pushFlag(
      'run_from',
      `run_from ${runFrom} is outside 0-100 — value dropped`,
      'warning'
    )
  if (rawRunTo != null && rawRunTo !== '' && runTo === null)
    pushFlag(
      'run_to',
      `run_to "${rawRunTo}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (runTo != null && (runTo < 0 || runTo > 100))
    pushFlag(
      'run_to',
      `run_to ${runTo} is outside 0-100 — value dropped`,
      'warning'
    )

  const enjoyment = toNum(getField(raw, 'enjoyment'))
  if (enjoyment != null && (enjoyment < 0 || enjoyment > 10))
    pushFlag(
      'enjoyment',
      `enjoyment ${enjoyment} is outside 0-10 — value dropped`,
      'warning'
    )

  const rawDevice = toStr(getField(raw, 'device'))
  let device: Device | null = null
  if (rawDevice) {
    const d = rawDevice.toLowerCase()
    if (d === 'pc' || d === 'mobile') device = d
    else
      pushFlag(
        'device',
        `unknown device "${rawDevice}" (use pc or mobile) — value dropped`,
        'warning'
      )
  }

  const rawVisibility = toStr(getField(raw, 'visibility'))
  let visibility: EntryVisibility | null = null
  if (rawVisibility) {
    const v = rawVisibility.toLowerCase()
    if (v === 'public') visibility = 'PUBLIC'
    else if (v === 'private') visibility = 'PRIVATE'
    else
      pushFlag(
        'visibility',
        `unknown visibility "${rawVisibility}" (use public or private) — value dropped`,
        'warning'
      )
  }

  const data: ImportProgressRow = {
    progressId: toStr(getField(raw, 'progress_id')),
    levelId: validLevelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    date: dateResult.ok && dateResult.iso ? dateResult.iso : null,
    dateUncertain: toBool(getField(raw, 'date_uncertain')),
    attempts: attempts != null && attempts >= 0 ? Math.round(attempts) : null,
    percentage:
      percentage != null && percentage >= 0 && percentage <= 100
        ? percentage
        : null,
    runFrom:
      runFrom != null && runFrom >= 0 && runFrom <= 100
        ? Math.round(runFrom)
        : null,
    runTo:
      runTo != null && runTo >= 0 && runTo <= 100 ? Math.round(runTo) : null,
    onStream: toBool(getField(raw, 'on_stream')),
    fps:
      toNum(getField(raw, 'fps')) != null
        ? Math.round(toNum(getField(raw, 'fps'))!)
        : null,
    device,
    enjoyment:
      enjoyment != null && enjoyment >= 0 && enjoyment <= 10 ? enjoyment : null,
    notes: toStr(getField(raw, 'notes')),
    highlightUrl: toStr(getField(raw, 'highlight_url')),
    visibility,
    inGameDifficulty: toStr(getField(raw, 'in_game_difficulty')),
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
  const pushFlag = (
    field: string,
    message: string,
    severity: 'error' | 'warning'
  ) => flags.push({ rowIndex, rowLabel: label, field, message, severity })

  let validLevelId: string | null = null
  if (levelId && /^\d+$/.test(levelId)) {
    validLevelId = levelId
  } else if (levelId) {
    if (levelName)
      pushFlag(
        'level_id',
        `level_id "${levelId}" isn't numeric — resolving by name instead`,
        'warning'
      )
    else
      pushFlag(
        'level_id',
        `level_id "${levelId}" isn't numeric and no level_name given — row cannot be imported`,
        'error'
      )
  } else if (levelName) {
    pushFlag(
      'level_id',
      'No level_id — will be resolved from level_name during import',
      'warning'
    )
  } else {
    pushFlag(
      'level_id',
      'Missing level_id and level_name — row cannot be imported',
      'error'
    )
  }

  const rawDate = getField(raw, 'dropped_at')
  const dateResult = parseDate(rawDate, dateFormat)
  if (!dateResult.ok)
    pushFlag('dropped_at', `${dateResult.reason} — value dropped`, 'warning')

  const rawBestProgress = getField(raw, 'best_progress')
  const bestProgress = toPercent(rawBestProgress)
  if (
    rawBestProgress != null &&
    rawBestProgress !== '' &&
    bestProgress === null
  )
    pushFlag(
      'best_progress',
      `best_progress "${rawBestProgress}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (bestProgress != null && (bestProgress < 0 || bestProgress > 100))
    pushFlag(
      'best_progress',
      `best_progress ${bestProgress} is outside 0-100 — value dropped`,
      'warning'
    )

  const rawRunFrom = getField(raw, 'run_from')
  const rawRunTo = getField(raw, 'run_to')
  const runFrom = toPercent(rawRunFrom)
  const runTo = toPercent(rawRunTo)
  if (rawRunFrom != null && rawRunFrom !== '' && runFrom === null)
    pushFlag(
      'run_from',
      `run_from "${rawRunFrom}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (runFrom != null && (runFrom < 0 || runFrom > 100))
    pushFlag(
      'run_from',
      `run_from ${runFrom} is outside 0-100 — value dropped`,
      'warning'
    )
  if (rawRunTo != null && rawRunTo !== '' && runTo === null)
    pushFlag(
      'run_to',
      `run_to "${rawRunTo}" isn't a valid number — value dropped`,
      'warning'
    )
  else if (runTo != null && (runTo < 0 || runTo > 100))
    pushFlag(
      'run_to',
      `run_to ${runTo} is outside 0-100 — value dropped`,
      'warning'
    )

  const rawAttempts = getField(raw, 'attempts_at_drop')
  const attemptsAtDrop = toNum(rawAttempts)
  if (rawAttempts != null && rawAttempts !== '' && attemptsAtDrop === null)
    pushFlag(
      'attempts_at_drop',
      `attempts_at_drop "${rawAttempts}" isn't a valid number — value dropped`,
      'warning'
    )

  const data: ImportDroppedRow = {
    dropId: toStr(getField(raw, 'drop_id')),
    levelId: validLevelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    inGameDifficulty: toStr(getField(raw, 'in_game_difficulty')),
    bestProgress:
      bestProgress != null && bestProgress >= 0 && bestProgress <= 100
        ? bestProgress
        : null,
    runFrom:
      runFrom != null && runFrom >= 0 && runFrom <= 100
        ? Math.round(runFrom)
        : null,
    runTo:
      runTo != null && runTo >= 0 && runTo <= 100 ? Math.round(runTo) : null,
    attemptsAtDrop:
      attemptsAtDrop != null && attemptsAtDrop >= 0
        ? Math.round(attemptsAtDrop)
        : null,
    droppedAt: dateResult.ok && dateResult.iso ? dateResult.iso : null,
    reason: toStr(getField(raw, 'reason')),
  }

  return { rowIndex, data, flags }
}

// ── Ranking tab ────────────────────────────────────────────────────────────

function parseRankingRow(
  raw: Record<string, unknown>,
  rowIndex: number
): ParsedRankingRow {
  const flags: ParseFlag[] = []
  const rawLevelId = toStr(getField(raw, 'level_id'))
  const levelName = toStr(getField(raw, 'level_name'))
  const label = rowLabelFor(levelName, rawLevelId, rowIndex)
  const pushFlag = (
    field: string,
    message: string,
    severity: 'error' | 'warning'
  ) => flags.push({ rowIndex, rowLabel: label, field, message, severity })

  let levelId: string | null = null
  if (rawLevelId && /^\d+$/.test(rawLevelId)) {
    levelId = rawLevelId
  } else if (rawLevelId && !levelName) {
    pushFlag(
      'level_id',
      `level_id "${rawLevelId}" isn't numeric and no level_name given — row cannot be ranked`,
      'error'
    )
  } else if (rawLevelId && levelName) {
    pushFlag(
      'level_id',
      `level_id "${rawLevelId}" isn't numeric — using level_name instead`,
      'warning'
    )
  }
  if (!levelId && !levelName) {
    pushFlag(
      'level_id',
      'Missing level_id and level_name — row cannot be ranked',
      'error'
    )
  }

  // rank is an optional convenience number; row order is authoritative if absent.
  const rawRank = getField(raw, 'rank')
  const rankNum = toNum(rawRank)
  if (rawRank != null && rawRank !== '' && rankNum === null)
    pushFlag(
      'rank',
      `rank "${rawRank}" isn't a valid number — using row order`,
      'warning'
    )
  const rank = rankNum != null && rankNum > 0 ? Math.round(rankNum) : null

  return { rowIndex, levelId, levelName, rank, flags }
}

// ── Lists tab ──────────────────────────────────────────────────────────────

function parseListRow(
  raw: Record<string, unknown>,
  rowIndex: number
): ParsedListRow {
  const flags: ParseFlag[] = []
  const list = toStr(getField(raw, 'list', 'list_name'))
  const rawLevelId = toStr(getField(raw, 'level_id'))
  const levelName = toStr(getField(raw, 'level_name'))
  const label = list
    ? `${list}: ${levelName ?? rawLevelId ?? `row ${rowIndex + 2}`}`
    : rowLabelFor(levelName, rawLevelId, rowIndex)
  const pushFlag = (
    field: string,
    message: string,
    severity: 'error' | 'warning'
  ) => flags.push({ rowIndex, rowLabel: label, field, message, severity })

  if (!list) pushFlag('list', 'Missing list — row cannot be imported', 'error')

  let levelId: string | null = null
  if (rawLevelId && /^\d+$/.test(rawLevelId)) {
    levelId = rawLevelId
  } else if (rawLevelId && !levelName) {
    pushFlag(
      'level_id',
      `level_id "${rawLevelId}" isn't numeric and no level_name given — row cannot be imported`,
      'error'
    )
  } else if (rawLevelId && levelName) {
    pushFlag(
      'level_id',
      `level_id "${rawLevelId}" isn't numeric — resolving by name instead`,
      'warning'
    )
  } else if (!levelName) {
    pushFlag(
      'level_id',
      'Missing level_id and level_name — row cannot be imported',
      'error'
    )
  } else {
    pushFlag(
      'level_id',
      'No level_id — will be resolved from level_name during import',
      'warning'
    )
  }

  const rawPosition = getField(raw, 'position')
  const positionNum = toNum(rawPosition)
  if (rawPosition != null && rawPosition !== '' && positionNum === null)
    pushFlag(
      'position',
      `position "${rawPosition}" isn't a valid number — using row order`,
      'warning'
    )
  const position = positionNum != null ? Math.round(positionNum) : null

  return {
    rowIndex,
    list,
    levelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    inGameDifficulty: toStr(getField(raw, 'in_game_difficulty')),
    position,
    flags,
  }
}

// ── Ratings tab ────────────────────────────────────────────────────────────

// Columns in the Ratings tab that identify the level rather than a category.
// The Ranking tab's fixed columns. Everything else in its header row is a
// rating category name.
const RESERVED_RATING_COLS = new Set([
  'rank',
  'level_id',
  'level_name',
  'creator',
  'publisher',
  'level_author',
  'in_game_difficulty',
  'simple_rating',
])

// Parses a rating cell to the internal 0-100 scale, accepting either a 0-10
// value (≤10 → ×10) or a 0-100 value (>10 → as-is): "9.5" and "95" both → 95.
function toScore100(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).trim().replace(/%\s*$/, '').trim()
  if (s === '') return null
  const n = Number(s)
  if (isNaN(n)) return null
  return Math.round(n <= 10 ? n * 10 : n)
}

function parseRatingRow(
  raw: Record<string, unknown>,
  rowIndex: number,
  categoryNames: string[]
): ParsedRatingRow {
  const flags: ParseFlag[] = []
  // The simple score shares this tab with the category columns — the two are
  // the same subject expressed by whichever mode the user is in.
  const simpleRating = toScore100(getField(raw, 'simple_rating'))
  const rawLevelId = toStr(getField(raw, 'level_id'))
  const levelName = toStr(getField(raw, 'level_name'))
  const label = rowLabelFor(levelName, rawLevelId, rowIndex)
  const pushFlag = (
    field: string,
    message: string,
    severity: 'error' | 'warning'
  ) => flags.push({ rowIndex, rowLabel: label, field, message, severity })

  let levelId: string | null = null
  if (rawLevelId && /^\d+$/.test(rawLevelId)) {
    levelId = rawLevelId
  } else if (rawLevelId && !levelName) {
    pushFlag(
      'level_id',
      `level_id "${rawLevelId}" isn't numeric and no level_name given — row cannot be imported`,
      'error'
    )
  } else if (rawLevelId && levelName) {
    pushFlag(
      'level_id',
      `level_id "${rawLevelId}" isn't numeric — resolving by name instead`,
      'warning'
    )
  } else if (!levelName) {
    pushFlag(
      'level_id',
      'Missing level_id and level_name — row cannot be imported',
      'error'
    )
  }

  const scores: Record<string, number> = {}
  for (const cat of categoryNames) {
    const rawScore = getField(raw, cat)
    if (rawScore == null || rawScore === '') continue
    const score = toScore100(rawScore)
    if (score === null) {
      pushFlag(
        cat,
        `${cat} score "${rawScore}" isn't a valid number — value dropped`,
        'warning'
      )
      continue
    }
    if (score < 0 || score > 100) {
      pushFlag(
        cat,
        `${cat} score "${rawScore}" is out of range (0-10 or 0-100) — value dropped`,
        'warning'
      )
      continue
    }
    scores[cat] = score
  }

  return {
    rowIndex,
    levelId,
    levelName,
    creator: toStr(getField(raw, 'creator', 'publisher', 'level_author')),
    inGameDifficulty: toStr(getField(raw, 'in_game_difficulty')),
    scores,
    simpleRating,
    flags,
  }
}

/**
 * Parses an uploaded workbook into rows and flags.
 *
 * Never throws on bad data: a malformed value becomes a {@link ParseFlag} so
 * the review step can show the user exactly what will be skipped and why. It
 * only throws when the file itself cannot be read as a workbook.
 *
 * @param dateFormat - How to read date cells. The sheet carries no format
 * marker, so this comes from the user's choice on the upload step.
 */
/**
 * Puts an ordering tab's rows in order, best/hardest first.
 *
 * If every importable row carries a rank number, the numbers are authoritative
 * (rank 1 first); otherwise the sheet's own row order is the order. Shared by
 * both ordering tabs so a workbook's Demon List and Ranking tabs cannot be read
 * by different rules.
 */
function orderRankingRows(rows: ParsedRankingRow[]): ParsedRankingRow[] {
  const candidates = rows.filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') && (r.levelId || r.levelName)
  )
  const allHaveRank =
    candidates.length > 0 && candidates.every((r) => r.rank != null)
  return allHaveRank
    ? [...rows].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    : rows
}

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
  const progressSheet = findSheet('Progress')
  const droppedSheet = findSheet('Dropped')
  const demonListSheet = findSheet('Demon List')
  const ratingRankingSheet = findSheet('Ranking')
  const listsSheet = findSheet('Lists')

  const rawCompletions: Record<string, unknown>[] = completionSheet
    ? XLSX.utils.sheet_to_json(completionSheet, { defval: null })
    : []
  const rawProgress: Record<string, unknown>[] = progressSheet
    ? XLSX.utils.sheet_to_json(progressSheet, { defval: null })
    : []
  const rawDropped: Record<string, unknown>[] = droppedSheet
    ? XLSX.utils.sheet_to_json(droppedSheet, { defval: null })
    : []
  const rawRanking: Record<string, unknown>[] = demonListSheet
    ? XLSX.utils.sheet_to_json(demonListSheet, { defval: null })
    : []
  const rawRatingRanking: Record<string, unknown>[] = ratingRankingSheet
    ? XLSX.utils.sheet_to_json(ratingRankingSheet, { defval: null })
    : []
  const rawLists: Record<string, unknown>[] = listsSheet
    ? XLSX.utils.sheet_to_json(listsSheet, { defval: null })
    : []

  const completions = rawCompletions.map((r, i) =>
    parseCompletionRow(r as Record<string, unknown>, i, dateFormat)
  )
  const progress = rawProgress.map((r, i) =>
    parseProgressRow(r as Record<string, unknown>, i, dateFormat)
  )
  const dropped = rawDropped.map((r, i) =>
    parseDroppedRow(r as Record<string, unknown>, i, dateFormat)
  )

  const rankingRows = rawRanking.map((r, i) =>
    parseRankingRow(r as Record<string, unknown>, i)
  )
  // Order hardest → easiest. If every importable row carries a rank number, the
  // numbers are authoritative (rank 1 = hardest); otherwise the sheet's row
  // order is the order (top row = hardest).
  const ranking = orderRankingRows(rankingRows)

  // The rating order, ordered best → worst by exactly the same rule: explicit
  // rank numbers when every importable row has one, otherwise sheet order.
  const ratingRanking = orderRankingRows(
    rawRatingRanking.map((r, i) => parseRankingRow(r as Record<string, unknown>, i))
  )

  const lists = rawLists.map((r, i) =>
    parseListRow(r as Record<string, unknown>, i)
  )

  // The Ranking tab is "wide": every header that is not one of its fixed
  // columns is a rating category. It yields TWO things — the manual order and
  // the scores — because one level's rating is one subject however the user's
  // mode chooses to express it.
  let ratingCategories: string[] = []
  let ratings: ParsedRatingRow[] = []
  if (ratingRankingSheet) {
    const headerRow = (XLSX.utils.sheet_to_json(ratingRankingSheet, {
      header: 1,
    })[0] ?? []) as unknown[]
    ratingCategories = headerRow
      .map((h) => (h == null ? '' : String(h).trim()))
      .filter((h) => h && !RESERVED_RATING_COLS.has(normalizeKey(h)))
    ratings = rawRatingRanking.map((r, i) =>
      parseRatingRow(r, i, ratingCategories)
    )
  }

  // Detect intra-tab duplicate level IDs. Dropped is additive (like Progress),
  // so multiple rows per level there are expected, not flagged.
  const duplicateLevelIds: ParseResult['duplicateLevelIds'] = []

  const completionIdMap = new Map<string, number[]>()
  for (const row of completions) {
    if (!row.data.levelId) continue
    const existing = completionIdMap.get(row.data.levelId) ?? []
    existing.push(row.rowIndex)
    completionIdMap.set(row.data.levelId, existing)
  }
  for (const [levelId, rows] of completionIdMap) {
    if (rows.length > 1)
      duplicateLevelIds.push({ tab: 'completions', levelId, rows })
  }

  return {
    completions,
    progress,
    dropped,
    ranking,
    ratingRanking,
    lists,
    ratings,
    ratingCategories,
    duplicateLevelIds,
  }
}
