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

// Ranking tab: your personal difficulty order of levels you've completed.
// Order is what matters (top = hardest); the rank number is just a convenience.
const RANKING_HEADERS = ['rank', 'level_id', 'level_name']

const RANKING_EXAMPLE_ROWS: (string | number)[][] = [
  [1, '', 'Tartarus'],
  [2, '', 'Acheron'],
]

// Lists tab: membership of your want-to-beat / favorites / least-favorites and
// any custom lists. `list` is a reserved keyword or a custom list name.
const LIST_HEADERS = ['list', 'level_id', 'level_name', 'creator', 'in_game_difficulty', 'position']

const LIST_EXAMPLE_ROWS: (string | number)[][] = [
  ['want_to_beat', '', 'Slaughterhouse', 'Icedcave', 'Extreme Demon', 1],
  ['favorites', '', 'Sonic Wave', 'Cyclic', 'Extreme Demon', 1],
  ['My Custom List', '', 'Bloodbath', 'Riot', 'Extreme Demon', 1],
]

// Ratings tab: weighted category scores. Identity columns first, then one column
// per rating category (headers named after your categories). The category
// columns here are just the seeded defaults — rename / add / remove to match yours.
const RATING_HEADERS = [
  'level_id',
  'level_name',
  'creator',
  'in_game_difficulty',
  'Gameplay',
  'Decoration',
  'Song',
]

const RATING_EXAMPLE_ROWS: (string | number)[][] = [
  ['', 'Bloodbath', 'Riot', 'Extreme Demon', 8, 9, 7],
]

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
  ['Ranking', 'rank', 'no', 'Optional number (1 = hardest). If present it sorts the tab; if absent, the row order is the order (top row = hardest).'],
  ['Ranking', 'level_id', 'no*', 'Numeric in-game level ID of a level you have completed.'],
  ['Ranking', 'level_name', 'no*', 'Level name — matched against your completed levels. Required when level_id is blank.'],
  ['Ranking', '(note)', '', 'The Ranking tab replaces your whole ranking. Levels you haven’t completed are skipped. Omit the tab to keep your existing ranking.'],
  ['', '', '', ''],
  ['Lists', 'list', 'yes', 'Reserved: want_to_beat, favorites, least_favorites. Anything else is a custom list of that name.'],
  ['Lists', 'level_id', 'no*', 'Numeric in-game level ID. Leave blank to resolve by level_name (creator + in_game_difficulty narrow it down).'],
  ['Lists', 'level_name', 'no*', 'Level name — matched against the GD servers. A listed level need not be completed.'],
  ['Lists', 'creator', 'no', 'Creator name — narrows name resolution when level_name matches multiple levels.'],
  ['Lists', 'in_game_difficulty', 'no', 'e.g. "Easy" (Demon is implied). Used to filter name resolution when level_id is blank.'],
  ['Lists', 'position', 'no', 'Optional order within the list. Row order is used if blank.'],
  ['Lists', '(note)', '', 'Each list named in the tab has its membership replaced. Lists you don’t mention are left alone.'],
  ['', '', '', ''],
  ['Ratings', 'level_id', 'no*', 'Numeric in-game level ID. Leave blank to resolve by level_name (creator + in_game_difficulty narrow it down).'],
  ['Ratings', 'level_name', 'no*', 'The level — matched against your completed levels. Scores attach to the completion.'],
  ['Ratings', 'creator', 'no', 'Creator name — narrows name resolution when level_name matches multiple levels.'],
  ['Ratings', 'in_game_difficulty', 'no', 'e.g. "Easy" (Demon is implied). Used to filter name resolution when level_id is blank.'],
  ['Ratings', '(category columns)', 'no', 'Every other column header is a rating category name; the cell is that level’s score (0-10 or 0-100 — both accepted). Categories are matched by name and created if missing.'],
  ['Ratings', '(note)', '', 'Only the categories you include are written; a level must be completed to be rated. New categories are added with weight 0 — set weights in Settings.'],
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

  // Ranking tab: header row + a couple example rows (order = hardest first)
  const rankingData = [RANKING_HEADERS, ...RANKING_EXAMPLE_ROWS]
  const rankingSheet = XLSX.utils.aoa_to_sheet(rankingData)
  XLSX.utils.book_append_sheet(wb, rankingSheet, 'Ranking')

  // Lists tab: header row + example rows
  const listData = [LIST_HEADERS, ...LIST_EXAMPLE_ROWS]
  const listSheet = XLSX.utils.aoa_to_sheet(listData)
  XLSX.utils.book_append_sheet(wb, listSheet, 'Lists')

  // Ratings tab: identity columns + one column per category
  const ratingData = [RATING_HEADERS, ...RATING_EXAMPLE_ROWS]
  const ratingSheet = XLSX.utils.aoa_to_sheet(ratingData)
  XLSX.utils.book_append_sheet(wb, ratingSheet, 'Ratings')

  // Descriptions tab
  const descSheet = XLSX.utils.aoa_to_sheet(FIELD_DESCRIPTIONS)
  XLSX.utils.book_append_sheet(wb, descSheet, 'Field Descriptions')

  XLSX.writeFile(wb, 'infernolog-import-template.xlsx')
}
