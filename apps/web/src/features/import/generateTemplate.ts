// Generates and triggers download of the blank import template xlsx.
// The template is identical to the export format, making round-trips safe.
// Contains: headers + one example row + a descriptions tab.

import * as XLSX from 'xlsx'

const COMPLETION_HEADERS = [
  'level_id',
  'level_name',
  'creator',
  'date',
  'date_uncertain',
  'attempts',
  'percentage',
  'run_from',
  'run_to',
  'on_stream',
  'fps',
  'device',
  'enjoyment',
  'simple_rating',
  'difficulty_opinion',
  'difficulty_opinion_stars',
  'coin_1',
  'coin_2',
  'coin_3',
  'two_player_solo',
  'two_player_partner',
  'in_game_difficulty',
  'gddl_tier',
  'nlw_tier',
  'notes',
  'level_notes',
  'video_url',
  'highlight_url',
  'visibility',
]

const DROPPED_HEADERS = [
  'level_id',
  'level_name',
  'creator',
  'in_game_difficulty',
  'best_progress',
  'run_from',
  'run_to',
  'attempts_at_drop',
  'dropped_at',
  'reason',
  'gddl_tier_at_drop',
]

const COMPLETION_EXAMPLE: Record<string, string | number | boolean> = {
  level_id: '10565740',
  level_name: 'Bloodbath',
  creator: 'Riot',
  date: '12/25/2024',
  date_uncertain: false,
  attempts: 5000,
  percentage: 99,
  run_from: '',
  run_to: '',
  on_stream: false,
  fps: 360,
  device: 'pc',
  enjoyment: 9.5,
  simple_rating: 9,
  difficulty_opinion: 'extreme',
  difficulty_opinion_stars: '',
  coin_1: '',
  coin_2: '',
  coin_3: '',
  two_player_solo: '',
  two_player_partner: '',
  in_game_difficulty: 'Extreme Demon',
  gddl_tier: 24,
  nlw_tier: '',
  notes: 'EXAMPLE ROW — delete before importing',
  level_notes: '',
  video_url: '',
  highlight_url: '',
  visibility: 'public',
}

const DROPPED_EXAMPLE: Record<string, string | number> = {
  level_id: '26681070',
  level_name: 'Sonic Wave',
  creator: 'lSunix',
  in_game_difficulty: 'Extreme Demon',
  best_progress: 87,
  run_from: 23,
  run_to: 87,
  attempts_at_drop: 3000,
  dropped_at: '06/15/2023',
  reason: 'EXAMPLE ROW — delete before importing',
  gddl_tier_at_drop: 55,
}

const FIELD_DESCRIPTIONS = [
  ['Tab', 'Field', 'Required', 'Format / Notes'],
  ['Completions', 'level_id', 'no*', 'Numeric in-game level ID. Leave blank to resolve by level_name (creator + in_game_difficulty narrow it down).'],
  ['Completions', 'level_name', 'no*', 'Level name. Required when level_id is blank — matched against the GD servers.'],
  ['Completions', 'creator', 'no', 'Creator name — narrows name resolution when level_name matches multiple levels.'],
  ['Completions', 'date', 'no', 'In your selected date format (MM/DD/YYYY by default). Unreadable dates are dropped, not the row.'],
  ['Completions', 'date_uncertain', 'no', 'TRUE or FALSE'],
  ['Completions', 'attempts', 'no', 'Integer — cumulative attempt count'],
  ['Completions', 'percentage', 'no', 'Worst fail / last logged % (0-100). A trailing "%" is fine.'],
  ['Completions', 'run_from', 'no', 'Start of best run segment (0-100). A trailing "%" is fine.'],
  ['Completions', 'run_to', 'no', 'End of best run segment (0-100). A trailing "%" is fine.'],
  ['Completions', 'on_stream', 'no', 'TRUE or FALSE'],
  ['Completions', 'fps', 'no', 'Integer (e.g. 360)'],
  ['Completions', 'device', 'no', 'pc or mobile'],
  ['Completions', 'enjoyment', 'no', '0-10 (decimals OK, e.g. 9.5)'],
  ['Completions', 'simple_rating', 'no', '0-10 (decimals OK)'],
  [
    'Completions',
    'difficulty_opinion',
    'no',
    'One of: not_demon_worthy, easy, medium, hard, insane, extreme',
  ],
  ['Completions', 'difficulty_opinion_stars', 'no', 'Integer 1-9 — the non-demon star rating, only when difficulty_opinion is not_demon_worthy.'],
  ['Completions', 'coin_1', 'no', 'TRUE or FALSE — was the 1st user coin collected? Ignored for levels without coins.'],
  ['Completions', 'coin_2', 'no', 'TRUE or FALSE — was the 2nd user coin collected? Ignored for levels without coins.'],
  ['Completions', 'coin_3', 'no', 'TRUE or FALSE — was the 3rd user coin collected? Ignored for levels without coins.'],
  ['Completions', 'two_player_solo', 'no', 'TRUE = beaten solo, FALSE = beaten with a partner (name in two_player_partner). Leave blank if not a 2-player level.'],
  ['Completions', 'two_player_partner', 'no', "Partner's name — only when two_player_solo is FALSE."],
  ['Completions', 'in_game_difficulty', 'no', 'e.g. "Easy" (Demon is implied). Used to filter name resolution when level_id is blank; otherwise autofilled from the GD servers.'],
  ['Completions', 'gddl_tier', 'no', 'Whole-number tier (autofilled from GDDL if you have a key connected; decimals are rounded).'],
  ['Completions', 'nlw_tier', 'no', 'Tier name'],
  ['Completions', 'notes', 'no', 'Free text about this completion (max 2000 chars)'],
  ['Completions', 'level_notes', 'no', 'Free text about the level overall — kept separate from notes (max 2000 chars).'],
  ['Completions', 'video_url', 'no', 'Full URL'],
  ['Completions', 'highlight_url', 'no', 'Full URL'],
  ['Completions', 'visibility', 'no', 'public or private (per-entry privacy). Defaults to public.'],
  ['', '', '', ''],
  ['Dropped', 'level_id', 'no*', 'Numeric in-game level ID. Leave blank to resolve by level_name (creator + in_game_difficulty narrow it down).'],
  ['Dropped', 'level_name', 'no*', 'Level name. Required when level_id is blank — matched against the GD servers.'],
  ['Dropped', 'creator', 'no', 'Creator name — narrows name resolution when level_name matches multiple levels.'],
  ['Dropped', 'in_game_difficulty', 'no', 'e.g. "Easy" (Demon is implied). Used to filter name resolution when level_id is blank.'],
  ['Dropped', 'best_progress', 'no', 'Best percentage reached (0-100). A trailing "%" is fine.'],
  ['Dropped', 'run_from', 'no', 'Start of best run segment (0-100). A trailing "%" is fine.'],
  ['Dropped', 'run_to', 'no', 'End of best run segment (0-100). A trailing "%" is fine.'],
  ['Dropped', 'attempts_at_drop', 'no', 'Integer attempt count at time of drop'],
  ['Dropped', 'dropped_at', 'no', 'Date in your selected format. Unreadable dates are dropped, not the row.'],
  ['Dropped', 'reason', 'no', 'Free text (max 2000 chars)'],
  ['Dropped', 'gddl_tier_at_drop', 'no', 'Whole-number tier at time of drop (decimals are rounded).'],
  ['', '', '', ''],
  ['* Either level_id or level_name must be provided for each row.', '', '', ''],
]

export function downloadTemplate(): void {
  const wb = XLSX.utils.book_new()

  // Completions tab: header row + example row
  const completionData = [
    COMPLETION_HEADERS,
    COMPLETION_HEADERS.map((h) => COMPLETION_EXAMPLE[h] ?? ''),
  ]
  const completionSheet = XLSX.utils.aoa_to_sheet(completionData)
  XLSX.utils.book_append_sheet(wb, completionSheet, 'Completions')

  // Dropped tab: header row + example row
  const droppedData = [
    DROPPED_HEADERS,
    DROPPED_HEADERS.map((h) => DROPPED_EXAMPLE[h] ?? ''),
  ]
  const droppedSheet = XLSX.utils.aoa_to_sheet(droppedData)
  XLSX.utils.book_append_sheet(wb, droppedSheet, 'Dropped')

  // Descriptions tab
  const descSheet = XLSX.utils.aoa_to_sheet(FIELD_DESCRIPTIONS)
  XLSX.utils.book_append_sheet(wb, descSheet, 'Field Descriptions')

  XLSX.writeFile(wb, 'infernolog-import-template.xlsx')
}
