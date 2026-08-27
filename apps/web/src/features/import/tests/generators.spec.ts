import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import type {
  ExportCompletion,
  ExportProgress,
  ExportResponse,
} from '@/lib/api/import'
import { parseSpreadsheet, type DateFormat } from '../parseSpreadsheet'

// Only the download is stubbed. XLSX.utils and XLSX.write stay real, so the
// workbook these build is the workbook a user gets — and can be handed
// straight back to parseSpreadsheet for the round-trip assertions below.
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>()
  return { ...actual, writeFile: vi.fn() }
})

const {
  COMPLETION_HEADERS,
  DROPPED_HEADERS,
  LIST_HEADERS,
  PROGRESS_HEADERS,
  RANKING_HEADERS,
  RATING_IDENTITY_HEADERS,
  downloadTemplate,
} = await import('../generateTemplate')
const { downloadExport } = await import('../generateExport')

const writeFile = vi.mocked(XLSX.writeFile)

/** The workbook handed to the (stubbed) download, and its filename. */
function written() {
  const [wb, filename] = writeFile.mock.calls[0]!
  return { wb: wb as XLSX.WorkBook, filename: filename as string }
}

/** One tab as arrays-of-arrays. */
function tab(wb: XLSX.WorkBook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
    header: 1,
    defval: '',
  })
}

const headerRow = (wb: XLSX.WorkBook, name: string) =>
  tab(wb, name)[0] as string[]

/** Serializes the written workbook and parses it back, as a re-import would. */
function reimport(wb: XLSX.WorkBook, format: DateFormat = 'MDY') {
  const buffer = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
  }) as ArrayBuffer
  return parseSpreadsheet(buffer, format)
}

const TABS = [
  'Completions',
  'Progress',
  'Dropped',
  'Demon List',
  'Lists',
  'Ratings',
  'Field Descriptions',
]

beforeEach(() => {
  writeFile.mockClear()
})

describe('downloadTemplate', () => {
  it('downloads a named .xlsx', () => {
    downloadTemplate()

    expect(written().filename).toBe('infernolog-import-template.xlsx')
  })

  it('includes every tab the importer reads, plus the instructions', () => {
    downloadTemplate()

    expect(written().wb.SheetNames).toEqual(TABS)
  })

  // The importer matches on these exact strings, so the template's header row
  // IS the contract — a drifted constant silently produces a blank column.
  it.each([
    ['Completions', () => COMPLETION_HEADERS],
    ['Progress', () => PROGRESS_HEADERS],
    ['Dropped', () => DROPPED_HEADERS],
    ['Demon List', () => RANKING_HEADERS],
    ['Lists', () => LIST_HEADERS],
  ])('heads the %s tab with its exported constant', (name, headers) => {
    downloadTemplate()

    expect(headerRow(written().wb, name)).toEqual(headers())
  })

  it('leads the Ratings tab with the identity columns', () => {
    downloadTemplate()
    const headers = headerRow(written().wb, 'Ratings')

    expect(headers.slice(0, RATING_IDENTITY_HEADERS.length)).toEqual(
      RATING_IDENTITY_HEADERS
    )
    expect(headers.length).toBeGreaterThan(RATING_IDENTITY_HEADERS.length)
  })

  it('gives every tab at least one example row', () => {
    downloadTemplate()
    const { wb } = written()

    for (const name of TABS.filter((t) => t !== 'Field Descriptions')) {
      expect(tab(wb, name).length).toBeGreaterThan(1)
    }
  })

  it('pads every example row to the width of its headers', () => {
    downloadTemplate()
    const { wb } = written()

    for (const name of TABS.filter((t) => t !== 'Field Descriptions')) {
      const rows = tab(wb, name)
      const width = rows[0]!.length
      for (const row of rows.slice(1)) {
        expect(row.length).toBeLessThanOrEqual(width)
      }
    }
  })

  // The whole point of the template: what a user downloads must be something
  // the importer accepts back. A header the parser does not recognize would
  // show up as an unidentifiable row.
  describe('round-tripping through the parser', () => {
    it('parses without a single error flag', () => {
      downloadTemplate()
      const result = reimport(written().wb)

      // Guards against an empty parse passing vacuously.
      expect(result.completions).toHaveLength(1)

      const allFlags = [
        ...result.completions.flatMap((r) => r.flags),
        ...result.progress.flatMap((r) => r.flags),
        ...result.dropped.flatMap((r) => r.flags),
        ...result.ranking.flatMap((r) => r.flags),
        ...result.lists.flatMap((r) => r.flags),
        ...result.ratings.flatMap((r) => r.flags),
      ]
      expect(allFlags.filter((f) => f.severity === 'error')).toEqual([])
    })

    it('yields an importable row on every tab', () => {
      downloadTemplate()
      const result = reimport(written().wb)

      expect(result.completions).toHaveLength(1)
      expect(result.progress).toHaveLength(1)
      expect(result.dropped).toHaveLength(1)
      expect(result.ranking.length).toBeGreaterThan(0)
      expect(result.lists.length).toBeGreaterThan(0)
      expect(result.ratings).toHaveLength(1)
    })

    it('recognizes the seeded rating categories, and no identity column', () => {
      downloadTemplate()
      const result = reimport(written().wb)

      expect(result.ratingCategories).toEqual([
        'Gameplay',
        'Decoration',
        'Song',
      ])
    })

    // The examples use level_name with a blank level_id, which is a supported
    // shape — so the only flags they raise are the name-resolution warnings.
    it('raises only name-resolution warnings for the examples', () => {
      downloadTemplate()
      const result = reimport(written().wb)

      const warnings = result.completions.flatMap((r) => r.flags)
      expect(warnings.every((f) => f.field === 'level_id')).toBe(true)
    })
  })
})

// ── Export ──────────────────────────────────────────────────────────────────

const completion = (
  overrides: Partial<ExportCompletion> = {}
): ExportCompletion => ({
  levelId: '128',
  levelName: 'Bloodbath',
  creator: 'Riot',
  inGameDifficulty: 'Extreme Demon',
  date: '2026-03-14',
  dateUncertain: false,
  attempts: 4200,
  percentage: 87,
  runFrom: 0,
  runTo: 87,
  onStream: true,
  fps: 240,
  device: 'pc',
  enjoyment: 80,
  simpleRating: 95,
  difficultyOpinion: 'EXTREME',
  coinsCollected: 0,
  twoPlayerSolo: null,
  twoPlayerPartner: null,
  visibility: 'PUBLIC',
  notes: 'gg',
  levelNotes: null,
  userGddlTier: 35,
  videoUrl: null,
  highlightUrl: null,
  ...overrides,
})

const progress = (overrides: Partial<ExportProgress> = {}): ExportProgress =>
  ({
    progressId: 'progress-uuid',
    levelId: '128',
    levelName: 'Bloodbath',
    creator: 'Riot',
    date: '2026-03-01',
    dateUncertain: false,
    attempts: 100,
    percentage: 42,
    runFrom: 0,
    runTo: 42,
    onStream: false,
    fps: 60,
    device: 'mobile',
    enjoyment: 70,
    notes: null,
    highlightUrl: null,
    visibility: 'PRIVATE',
    ...overrides,
  }) as ExportProgress

const exportData = (overrides: Partial<ExportResponse> = {}): ExportResponse =>
  ({
    completions: [],
    progress: [],
    dropped: [],
    ranking: [],
    collections: [],
    ratingCategories: [],
    ratings: [],
    ...overrides,
  }) as ExportResponse

/** The one Completions data row, keyed by header. */
function completionCells(wb: XLSX.WorkBook): Record<string, unknown> {
  const [headers, row] = tab(wb, 'Completions') as [string[], unknown[]]
  return Object.fromEntries(headers.map((h, i) => [h, row[i]]))
}

describe('downloadExport', () => {
  it('downloads a dated .xlsx', () => {
    downloadExport(exportData(), 'MDY')

    // TZ is pinned to UTC for the suite, so "today" is unambiguous here.
    expect(written().filename).toMatch(
      /^infernolog-export-\d{4}-\d{2}-\d{2}\.xlsx$/
    )
  })

  // Export and template must stay the same shape, or an export cannot be
  // re-imported and the template stops describing what you get back.
  it('lays out the same tabs as the template', () => {
    downloadExport(exportData(), 'MDY')

    expect(written().wb.SheetNames).toEqual(TABS)
  })

  it.each([
    ['Completions', () => COMPLETION_HEADERS],
    ['Progress', () => PROGRESS_HEADERS],
    ['Dropped', () => DROPPED_HEADERS],
    ['Demon List', () => RANKING_HEADERS],
    ['Lists', () => LIST_HEADERS],
  ])('heads the %s tab exactly as the template does', (name, headers) => {
    downloadExport(exportData(), 'MDY')

    expect(headerRow(written().wb, name)).toEqual(headers())
  })

  it('writes headers only for an empty account', () => {
    downloadExport(exportData(), 'MDY')
    const { wb } = written()

    expect(tab(wb, 'Completions')).toHaveLength(1)
    expect(tab(wb, 'Demon List')).toHaveLength(1)
  })

  describe('cell formatting', () => {
    const cellsFor = (
      overrides: Partial<ExportCompletion>,
      fmt: DateFormat = 'MDY'
    ) => {
      downloadExport(exportData({ completions: [completion(overrides)] }), fmt)
      return completionCells(written().wb)
    }

    it.each([
      ['MDY', '03/14/2026'],
      ['DMY', '14/03/2026'],
      ['ISO', '2026-03-14'],
    ] as const)('writes the date in %s order', (fmt, expected) => {
      expect(cellsFor({ date: '2026-03-14' }, fmt).date).toBe(expected)
    })

    it('leaves a missing date blank', () => {
      expect(cellsFor({ date: null }).date).toBe('')
    })

    // Ratings are 0-100 internally and 0-10 in the sheet; the importer's
    // "≤10 means 0-10" rule reads them back.
    it.each([
      [80, 8],
      [100, 10],
      [47, 4.7],
      [0, 0],
    ])('writes the internal score %s as %s', (internal, sheet) => {
      expect(cellsFor({ enjoyment: internal }).enjoyment).toBe(sheet)
    })

    it('leaves a missing score blank', () => {
      expect(cellsFor({ enjoyment: null }).enjoyment).toBe('')
    })

    // The coin bitmask becomes three user-facing boolean columns.
    it.each([
      [0, [false, false, false]],
      [1, [true, false, false]],
      [5, [true, false, true]],
      [7, [true, true, true]],
    ])('splits the coin mask %s into columns', (mask, expected) => {
      const cells = cellsFor({ coinsCollected: mask })

      expect([cells.coin_1, cells.coin_2, cells.coin_3]).toEqual(expected)
    })

    it('leaves the coin columns blank when no mask was recorded', () => {
      const cells = cellsFor({ coinsCollected: null })

      expect([cells.coin_1, cells.coin_2, cells.coin_3]).toEqual(['', '', ''])
    })

    // The wire format merges "not demon-worthy" with a star count; the sheet
    // keeps them as two columns for clarity.
    it('splits a non-demon opinion into an opinion and a star count', () => {
      const cells = cellsFor({ difficultyOpinion: 'THREE_STAR' })

      expect(cells.difficulty_opinion).toBe('not_demon_worthy')
      expect(cells.difficulty_opinion_stars).toBe(3)
    })

    it('writes a demon opinion lowercased, with no star count', () => {
      const cells = cellsFor({ difficultyOpinion: 'EXTREME' })

      expect(cells.difficulty_opinion).toBe('extreme')
      expect(cells.difficulty_opinion_stars).toBe('')
    })

    it('leaves both opinion columns blank when none was recorded', () => {
      const cells = cellsFor({ difficultyOpinion: null })

      expect(cells.difficulty_opinion).toBe('')
      expect(cells.difficulty_opinion_stars).toBe('')
    })

    it('lowercases the visibility enum', () => {
      expect(cellsFor({ visibility: 'PRIVATE' }).visibility).toBe('private')
    })

    it('writes booleans as booleans, not strings', () => {
      const cells = cellsFor({ onStream: true, dateUncertain: false })

      expect(cells.on_stream).toBe(true)
      expect(cells.date_uncertain).toBe(false)
    })

    it('blanks every nullable field rather than writing null', () => {
      const cells = cellsFor({
        levelName: null,
        creator: null,
        attempts: null,
        fps: null,
        notes: null,
        videoUrl: null,
        userGddlTier: null,
      })

      for (const key of [
        'level_name',
        'creator',
        'attempts',
        'fps',
        'notes',
        'video_url',
        'gddl_tier',
      ]) {
        expect(cells[key]).toBe('')
      }
    })

    // There is no NLW integration yet, so the column exists for round-trip
    // shape only and never carries data.
    it('always leaves nlw_tier blank', () => {
      expect(cellsFor({}).nlw_tier).toBe('')
    })
  })

  describe('the ratings tab', () => {
    it('adds one column per category, after the identity columns', () => {
      downloadExport(
        exportData({
          ratingCategories: ['Gameplay', 'Design'],
          ratings: [
            {
              levelId: '128',
              levelName: 'Bloodbath',
              creator: null,
              inGameDifficulty: null,
              scores: { Gameplay: 80, Design: 60 },
            },
          ],
        }),
        'MDY'
      )

      expect(headerRow(written().wb, 'Ratings')).toEqual([
        ...RATING_IDENTITY_HEADERS,
        'Gameplay',
        'Design',
      ])
    })

    it('writes each score on the sheet scale', () => {
      downloadExport(
        exportData({
          ratingCategories: ['Gameplay'],
          ratings: [
            {
              levelId: '128',
              levelName: null,
              creator: null,
              inGameDifficulty: null,
              scores: { Gameplay: 95 },
            },
          ],
        }),
        'MDY'
      )
      const [, row] = tab(written().wb, 'Ratings')

      expect(row![RATING_IDENTITY_HEADERS.length]).toBe(9.5)
    })

    it('blanks a category the level was never scored on', () => {
      downloadExport(
        exportData({
          ratingCategories: ['Gameplay', 'Design'],
          ratings: [
            {
              levelId: '128',
              levelName: null,
              creator: null,
              inGameDifficulty: null,
              scores: { Gameplay: 80 },
            },
          ],
        }),
        'MDY'
      )
      const [, row] = tab(written().wb, 'Ratings')

      expect(row![RATING_IDENTITY_HEADERS.length + 1]).toBe('')
    })
  })

  // The contract the module docs claim: an export re-imports cleanly. This is
  // the assertion that would catch a header, scale, or date-format drift
  // between the two halves.
  describe('round-tripping an export back through the parser', () => {
    const fullExport = () =>
      exportData({
        completions: [completion()],
        progress: [progress()],
        dropped: [
          {
            dropId: 'drop-uuid',
            levelId: '200',
            levelName: 'Cataclysm',
            creator: 'Ggb0y',
            inGameDifficulty: 'Extreme Demon',
            bestProgress: 61,
            attemptsAtDrop: 900,
            droppedAt: '2026-02-01',
            reason: 'burnout',
          },
        ],
        ranking: [
          { rank: 1, levelId: '128', levelName: 'Bloodbath' },
          { rank: 2, levelId: '200', levelName: 'Cataclysm' },
        ],
        collections: [
          {
            list: 'favorites',
            levelId: '128',
            levelName: 'Bloodbath',
            position: 0,
          },
        ],
        ratingCategories: ['Gameplay'],
        ratings: [
          {
            levelId: '128',
            levelName: 'Bloodbath',
            creator: 'Riot',
            inGameDifficulty: 'Extreme Demon',
            scores: { Gameplay: 80 },
          },
        ],
      })

    it('re-imports every tab with no flags at all', () => {
      downloadExport(fullExport(), 'MDY')
      const result = reimport(written().wb, 'MDY')

      // Asserted before the flags, so an empty parse cannot pass this
      // vacuously — no rows would mean no flags either.
      expect(result.completions).toHaveLength(1)
      expect(result.progress).toHaveLength(1)
      expect(result.dropped).toHaveLength(1)
      expect(result.ranking).toHaveLength(2)
      expect(result.lists).toHaveLength(1)
      expect(result.ratings).toHaveLength(1)

      const allFlags = [
        ...result.completions.flatMap((r) => r.flags),
        ...result.progress.flatMap((r) => r.flags),
        ...result.dropped.flatMap((r) => r.flags),
        ...result.ranking.flatMap((r) => r.flags),
        ...result.lists.flatMap((r) => r.flags),
        ...result.ratings.flatMap((r) => r.flags),
      ]
      expect(allFlags).toEqual([])
    })

    it('brings a completion back with its values intact', () => {
      downloadExport(fullExport(), 'MDY')
      const { data } = reimport(written().wb, 'MDY').completions[0]!

      expect(data).toMatchObject({
        levelId: '128',
        levelName: 'Bloodbath',
        creator: 'Riot',
        date: '2026-03-14',
        attempts: 4200,
        percentage: 87,
        onStream: true,
        fps: 240,
        notes: 'gg',
      })
    })

    // The 0-100 → 0-10 → 0-100 trip is the one that silently corrupts data if
    // either half changes scale.
    it('round-trips a rating score back to the internal scale', () => {
      downloadExport(fullExport(), 'MDY')
      const result = reimport(written().wb, 'MDY')

      expect(result.ratings[0]!.scores.Gameplay).toBe(80)
    })

    it('round-trips the round-trip identities', () => {
      downloadExport(fullExport(), 'MDY')
      const result = reimport(written().wb, 'MDY')

      expect(result.progress[0]!.data.progressId).toBe('progress-uuid')
      expect(result.dropped[0]!.data.dropId).toBe('drop-uuid')
    })

    it('round-trips the ranking in its exported order', () => {
      downloadExport(fullExport(), 'MDY')
      const result = reimport(written().wb, 'MDY')

      expect(result.ranking.map((r) => r.levelId)).toEqual(['128', '200'])
    })

    it('round-trips list membership', () => {
      downloadExport(fullExport(), 'MDY')
      const result = reimport(written().wb, 'MDY')

      expect(result.lists[0]).toMatchObject({
        list: 'favorites',
        levelId: '128',
      })
    })

    // The user picks the format on upload, and it has to be the one the
    // export was written in — otherwise 03/04 silently becomes 04/03.
    it.each(['MDY', 'DMY', 'ISO', 'YMD'] as const)(
      'round-trips a date written and read as %s',
      (fmt) => {
        downloadExport(fullExport(), fmt)
        const result = reimport(written().wb, fmt)

        expect(result.completions[0]!.data.date).toBe('2026-03-14')
      }
    )

    it('round-trips a dropped entry', () => {
      downloadExport(fullExport(), 'MDY')
      const { data } = reimport(written().wb, 'MDY').dropped[0]!

      expect(data).toMatchObject({
        levelId: '200',
        bestProgress: 61,
        attemptsAtDrop: 900,
        droppedAt: '2026-02-01',
        reason: 'burnout',
      })
    })
  })
})
