// Builds and downloads the account export .xlsx from the server's export JSON.
// The workbook is import-compatible (same tabs/columns as the template), so an
// export → reimport round-trips. All sheet-format concerns live here: date
// formatting (in the user's preference), the 0-100 → 0-10 rating scale, coin
// bitmask → columns, enum casing, and booleans.

import * as XLSX from 'xlsx'
import type { ExportResponse } from '@/lib/api/import'
import type { DateFormat } from './parseSpreadsheet'
import {
  COMPLETION_HEADERS,
  PROGRESS_HEADERS,
  DROPPED_HEADERS,
  RANKING_HEADERS,
  LIST_HEADERS,
  RATING_IDENTITY_HEADERS,
  FIELD_DESCRIPTIONS,
} from './generateTemplate'

type Cell = string | number | boolean

// ISO (YYYY-MM-DD) → the user's chosen display format.
function formatDate(isoStr: string | null, fmt: DateFormat): string {
  if (!isoStr) return ''
  const [y, m, d] = isoStr.split('-')
  if (!y || !m || !d) return isoStr
  if (fmt === 'MDY') return `${m}/${d}/${y}`
  if (fmt === 'DMY') return `${d}/${m}/${y}`
  if (fmt === 'YMD') return `${y}/${m}/${d}`
  return isoStr // ISO
}

// Internal 0-100 → the 0-10 sheet scale (round-trips through the importer's
// "≤10 means 0-10" rule). 47 → 4.7, 100 → 10, 80 → 8.
function toTenScale(v: number | null): Cell {
  if (v == null) return ''
  const n = v / 10
  return Number.isInteger(n) ? n : Math.round(n * 10) / 10
}

function coinBit(mask: number | null, bit: number): Cell {
  if (mask == null) return ''
  return (mask & (1 << bit)) !== 0
}

// The wire format merges "not demon-worthy" + a star count into one enum
// value; the sheet keeps them as two user-facing columns for clarity.
const OPINION_TO_STAR: Record<string, number> = {
  AUTO: 1,
  TWO_STAR: 2,
  THREE_STAR: 3,
  FOUR_STAR: 4,
  FIVE_STAR: 5,
  SIX_STAR: 6,
  SEVEN_STAR: 7,
  EIGHT_STAR: 8,
  NINE_STAR: 9,
}

function splitDifficultyOpinion(opinion: string | null): {
  difficulty_opinion: Cell
  difficulty_opinion_stars: Cell
} {
  if (!opinion) return { difficulty_opinion: '', difficulty_opinion_stars: '' }
  const star = OPINION_TO_STAR[opinion]
  if (star != null) {
    return {
      difficulty_opinion: 'not_demon_worthy',
      difficulty_opinion_stars: star,
    }
  }
  return { difficulty_opinion: opinion.toLowerCase(), difficulty_opinion_stars: '' }
}

function completionRecord(
  c: ExportResponse['completions'][number],
  fmt: DateFormat
): Record<string, Cell> {
  return {
    level_id: c.levelId,
    level_name: c.levelName ?? '',
    creator: c.creator ?? '',
    date: formatDate(c.date, fmt),
    date_uncertain: c.dateUncertain,
    attempts: c.attempts ?? '',
    percentage: c.percentage ?? '',
    run_from: c.runFrom ?? '',
    run_to: c.runTo ?? '',
    on_stream: c.onStream,
    fps: c.fps ?? '',
    device: c.device ?? '',
    enjoyment: toTenScale(c.enjoyment),
    simple_rating: toTenScale(c.simpleRating),
    ...splitDifficultyOpinion(c.difficultyOpinion),
    coin_1: coinBit(c.coinsCollected, 0),
    coin_2: coinBit(c.coinsCollected, 1),
    coin_3: coinBit(c.coinsCollected, 2),
    two_player_solo: c.twoPlayerSolo ?? '',
    two_player_partner: c.twoPlayerPartner ?? '',
    in_game_difficulty: c.inGameDifficulty ?? '',
    gddl_tier: c.userGddlTier ?? '',
    // nlw_tier has no backing data yet (no NLW integration) — always blank on
    // export. See docs/IMPORT_EXPORT.md.
    nlw_tier: '',
    notes: c.notes ?? '',
    level_notes: c.levelNotes ?? '',
    video_url: c.videoUrl ?? '',
    highlight_url: c.highlightUrl ?? '',
    visibility: c.visibility ? c.visibility.toLowerCase() : '',
  }
}

function progressRecord(
  p: ExportResponse['progress'][number],
  fmt: DateFormat
): Record<string, Cell> {
  return {
    progress_id: p.progressId,
    level_id: p.levelId,
    level_name: p.levelName ?? '',
    creator: p.creator ?? '',
    date: formatDate(p.date, fmt),
    date_uncertain: p.dateUncertain,
    attempts: p.attempts ?? '',
    percentage: p.percentage ?? '',
    run_from: p.runFrom ?? '',
    run_to: p.runTo ?? '',
    on_stream: p.onStream,
    fps: p.fps ?? '',
    device: p.device ?? '',
    enjoyment: toTenScale(p.enjoyment),
    notes: p.notes ?? '',
    highlight_url: p.highlightUrl ?? '',
    visibility: p.visibility ? p.visibility.toLowerCase() : '',
  }
}

function droppedRecord(
  d: ExportResponse['dropped'][number]
): Record<string, Cell> {
  return {
    drop_id: d.dropId,
    level_id: d.levelId,
    level_name: d.levelName ?? '',
    creator: d.creator ?? '',
    in_game_difficulty: d.inGameDifficulty ?? '',
    best_progress: d.bestProgress ?? '',
    run_from: '',
    run_to: '',
    attempts_at_drop: d.attemptsAtDrop ?? '',
    dropped_at: '', // filled below (needs date format)
    reason: d.reason ?? '',
    gddl_tier_at_drop: '',
  }
}

function rows(headers: string[], records: Record<string, Cell>[]): Cell[][] {
  return [headers, ...records.map((rec) => headers.map((h) => rec[h] ?? ''))]
}

export function downloadExport(
  data: ExportResponse,
  dateFormat: DateFormat
): void {
  const wb = XLSX.utils.book_new()

  // Completions
  const completionRecords = data.completions.map((c) =>
    completionRecord(c, dateFormat)
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(rows(COMPLETION_HEADERS, completionRecords)),
    'Completions'
  )

  // Progress (non-completion session logs)
  const progressRecords = data.progress.map((p) =>
    progressRecord(p, dateFormat)
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(rows(PROGRESS_HEADERS, progressRecords)),
    'Progress'
  )

  // Dropped
  const droppedRecords = data.dropped.map((d) => {
    const rec = droppedRecord(d)
    rec.dropped_at = formatDate(d.droppedAt, dateFormat)
    return rec
  })
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(rows(DROPPED_HEADERS, droppedRecords)),
    'Dropped'
  )

  // Ranking (hardest first)
  const rankingRecords = data.ranking.map((r) => ({
    rank: r.rank,
    level_id: r.levelId,
    level_name: r.levelName ?? '',
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(rows(RANKING_HEADERS, rankingRecords)),
    'Ranking'
  )

  // Lists
  const listRecords = data.collections.map((l) => ({
    list: l.list,
    level_id: l.levelId,
    level_name: l.levelName ?? '',
    creator: '',
    in_game_difficulty: '',
    position: l.position,
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(rows(LIST_HEADERS, listRecords)),
    'Lists'
  )

  // Ratings — identity columns + one column per category
  const ratingHeaders = [...RATING_IDENTITY_HEADERS, ...data.ratingCategories]
  const ratingAoa: Cell[][] = [
    ratingHeaders,
    ...data.ratings.map((r) =>
      ratingHeaders.map((h): Cell => {
        if (h === 'level_id') return r.levelId
        if (h === 'level_name') return r.levelName ?? ''
        if (h === 'creator') return r.creator ?? ''
        if (h === 'in_game_difficulty') return r.inGameDifficulty ?? ''
        return toTenScale(r.scores[h] ?? null)
      })
    ),
  ]
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(ratingAoa),
    'Ratings'
  )

  // Descriptions (same as the template) so the file is self-documenting.
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(FIELD_DESCRIPTIONS),
    'Field Descriptions'
  )

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `infernolog-export-${today}.xlsx`)
}
