import type { Page, Response } from '@playwright/test'
import * as XLSX from 'xlsx'
import { expect, test } from './testBase'
import { logCompletion } from './flows'
import { AIRBORNE_ROBOTS, PAYLOAD } from './fixtures/levels'

// The spreadsheet import across the wire, end to end: POST
// /v1/me/import/check → POST /v1/me/import/start → GET /v1/me/import/status
// polled to completion → PATCH /v1/me/import/rows/{rowId}/resolve, then GET
// /v1/me/export read back over the rows the import just wrote.
//
// This is the widest contract in the app and the one least covered by anything
// else. Four shapes cross here that no component spec ever sees unstubbed:
//
//   - The /check response's conflict payload. `ImportRowConflict.fields` is a
//     list of `{ field, existingValue, importedValue }` triples whose values
//     are `unknown` by construction (the diff spans every column type), and
//     whose field NAMES are the API's own camelCase property names — not the
//     sheet's snake_case headers, and not anything TypeScript relates to
//     either side. FieldConflictMerge looks each one up in fieldDescriptors to
//     decide how to render and validate it, so a server that renamed a field,
//     or reported a value on the wrong scale, degrades to an unlabelled row
//     rather than an error.
//   - The resolution travelling back on /start. The wizard folds the user's
//     choices into `ImportCommitRow.resolution`, which is the only thing
//     telling the worker to overwrite rather than skip a row it considers
//     already present — a dropped resolution reads as a successful import that
//     silently changed nothing.
//   - The job status. The import is asynchronous: /start returns a jobId and
//     everything the user sees afterwards comes from polling, so the status
//     payload's `outcomeCounts` and `flaggedRows` are the whole UI.
//   - The export sections, which are what make the round trip an identity.
//
// Deliberately one test, not several. The reset runs once per run, so a second
// test asserting "the export contains what the first test imported" would only
// pass in one position in the file — the order-independence rule the rest of
// this suite is written to. The export assertion belongs to the import that
// produced the rows, so it lives in the same test.

// Mobile viewport, for the reason completion.e2e.ts gives: `logCompletion`
// goes through the FAB, which is a mobile affordance. The wizard itself is a
// full-screen dialog below `md` and a centred one above it, but the calls it
// makes are identical.
test.use({ viewport: { width: 390, height: 844 } })

// The attempts count the completion is logged with, and the different one the
// sheet carries for the same level. Attempts is the whole conflict: it is the
// only field the sheet fills for a level that already has a completion, so
// /check must report exactly one field diff and no more.
const LOGGED_ATTEMPTS = 900
const IMPORTED_ATTEMPTS = 4242
// The second row's level has nothing logged against it, so it never conflicts.
const INSERTED_ATTEMPTS = 77

// The third row: a name-only row naming a level that does not exist, which is
// how this spec gets a flagged row to answer with PATCH .../resolve.
//
// Name resolution checks the levels cache first and falls back to a RobTop name
// search, and `searchRobtopByName` returns [] for every failure mode it has
// (timeout, non-200, rate-limiter miss) — so this row resolves to "Level not
// found" whether or not RobTop is reachable, and the assertions below do not
// depend on it. Only the worker's latency does, which is what the raised
// timeout covers.
const UNRESOLVABLE_NAME = 'InfernoLog E2E Nonexistent Level'

/** The subset of `ImportFieldDiff` this spec pins. */
interface FieldDiff {
  field: string
  existingValue: unknown
  importedValue: unknown
}

/** The parts of the /check response this spec reads. */
interface CheckResponse {
  completionConflicts: {
    rowIndex: number
    levelId: string
    levelName: string | null
    matchedId: string | null
    fields: FieldDiff[]
  }[]
  collectionsMerge: unknown[]
  rankingMerge: unknown | null
}

/** The /start request body, as the wizard builds it. */
interface StartRequest {
  rows: { type: string; rowIndex: number; resolution?: string }[]
}

/** The parts of the polled job status this spec reads. */
interface StatusResponse {
  data: {
    status: 'running' | 'completed' | 'failed'
    totalRows: number
    outcomeCounts: {
      committed: number
      updated: number
      skipped: number
      failed: number
    }
    flaggedRows: {
      id: string
      rowIndex: number
      levelName: string | null
      issueMessage: string
      resolved: boolean
    }[]
  }
}

/** One row of GET /v1/me/export?section=completions. */
interface ExportCompletion {
  levelId: string
  levelName: string | null
  attempts: number | null
}

/**
 * The three-row fixture workbook, built with the same library the app parses it
 * with.
 *
 * Only the columns the spec asserts on are present. Every other column parses
 * to null, and the check pass treats a null as "the sheet left this blank"
 * rather than a difference (createFieldPusher), so a narrow sheet is what makes
 * "exactly one field conflicts" true — a template-shaped sheet would diff every
 * column the logged completion happens to hold.
 *
 * No date column, for that reason and one more: a date would couple this spec
 * to the account's `dateFormatPreference` and to the parser's format handling,
 * which is progress.e2e.ts's subject rather than this one's.
 */
function buildWorkbook(): Buffer {
  const rows = [
    // Conflicts: this level already has a completion, logged by the test with
    // a different attempts count.
    {
      level_id: AIRBORNE_ROBOTS.inGameId,
      level_name: AIRBORNE_ROBOTS.name,
      attempts: IMPORTED_ATTEMPTS,
    },
    // Plain insert: nothing in the account refers to this level yet.
    {
      level_id: PAYLOAD.inGameId,
      level_name: PAYLOAD.name,
      attempts: INSERTED_ATTEMPTS,
    },
    // Name-only, and the name resolves nowhere — the worker flags it. A
    // missing level_id is a warning rather than an error, so the row is
    // imported (and fails at commit) rather than skipped at parse time.
    { level_id: '', level_name: UNRESOLVABLE_NAME, attempts: 1 },
  ]

  const sheet = XLSX.utils.json_to_sheet(rows, {
    // Pinned rather than inferred from the first row's keys, so a column
    // cannot silently vanish if a row omits it.
    header: ['level_id', 'level_name', 'attempts'],
  })
  const book = XLSX.utils.book_new()
  // Tab names are matched case-insensitively by parseSpreadsheet; this is the
  // spelling the downloadable template ships with.
  XLSX.utils.book_append_sheet(book, sheet, 'Completions')

  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/**
 * The import wizard's dialog, which every wizard locator is scoped through.
 *
 * The scoping is not tidiness. `ImportStatusToast` is a persistent toast
 * mounted at the app shell — a real `<button>` outside this dialog — and while
 * the job has an unresolved flagged row its label ("Import complete — 1 row
 * need review") shares wording with the flagged-row panel's own header. An
 * unscoped match on that finds two elements and fails strict mode rather than
 * the assertion.
 */
function wizard(page: Page) {
  return page.getByRole('dialog', { name: 'Import spreadsheet' })
}

/**
 * Matches the export response for one section.
 *
 * The export is drained section by section in parallel (seven of them, each
 * capped at 500 rows), so one click produces seven responses and only one
 * carries completions.
 */
function exportSection(section: string) {
  return (response: Response) => {
    const url = new URL(response.url())
    return (
      url.pathname.endsWith('/v1/me/export') &&
      url.searchParams.get('section') === section
    )
  }
}

test.describe('spreadsheet import', () => {
  // Budgeted rather than left at the default 60s. This test pays for a
  // completion logged through the wizard, two synchronous round trips (/check,
  // /start), a background Lambda with its own cold start, a status poll that
  // only samples every 2s, seven export sections, and the bounded RobTop
  // lookup the unresolvable row costs (the rate limiter waits up to 10s and
  // the fetch itself up to 5s). None of that is flake — it is work — so the
  // timeout is raised rather than the assertions loosened.
  //
  // It runs in ~23s against a warm staging stage, so this is roughly 5x
  // headroom for a cold one. Not more than that on purpose: the test timeout
  // is what bounds a genuinely hung request, and every second of it is paid
  // three times over on a spec that fails through all its retries.
  test.describe.configure({ timeout: 120_000 })

  test('imports a spreadsheet, resolves its conflict, and exports the result back', async ({
    page,
  }) => {
    // ── The completion the sheet will conflict with ──────────────────────
    //
    // Logged through the UI rather than seeded, so the conflict is between the
    // sheet and a completion written by the ordinary logging path — the two
    // producers whose disagreement the /check pass exists to describe.
    await page.goto('/list')
    await logCompletion(page, AIRBORNE_ROBOTS, String(LOGGED_ATTEMPTS))
    await page.getByRole('button', { name: 'Place later' }).click()

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    const dialog = wizard(page)
    const checked = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().endsWith('/v1/me/import/check')
    )

    // The file input is `sr-only` rather than hidden, and setInputFiles wants
    // the input itself, not the label wrapping the drop zone.
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'e2e-import.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buildWorkbook(),
    })

    // Parsing is local, so reaching the review step proves nothing about the
    // wire — but the count in this button's label is the spec's own check that
    // all three rows survived the parse, the name-only one included.
    await dialog.getByRole('button', { name: 'Import 3 rows' }).click()

    // ── /check: the conflict payload ────────────────────────────────────
    //
    // Pinned whole rather than field by field. `levelName` is the server's,
    // read out of the levels cache rather than echoed back from the sheet;
    // `matchedId` is null for completions specifically (a completion matches by
    // level, not by the round-trip id progress and dropped rows carry); and
    // `fields` holding exactly one entry is the assertion that a blank cell
    // means "unchanged" rather than "clear this field".
    const check = await checked
    expect(check.status()).toBe(200)
    const checkBody = (await check.json()) as CheckResponse
    expect(checkBody.completionConflicts).toEqual([
      {
        rowIndex: 0,
        levelId: AIRBORNE_ROBOTS.inGameId,
        levelName: AIRBORNE_ROBOTS.name,
        matchedId: null,
        fields: [
          {
            field: 'attempts',
            existingValue: LOGGED_ATTEMPTS,
            importedValue: IMPORTED_ATTEMPTS,
          },
        ],
      },
    ])
    // The sheet has no Ranking or Lists tab, so the wizard must go straight
    // from conflicts to the commit. Asserted rather than assumed: a server that
    // returned an empty merge object instead of null would park the wizard on a
    // resolve-lists step this spec never answers, and the failure would read as
    // a missing button.
    expect(checkBody.rankingMerge).toBeNull()
    expect(checkBody.collectionsMerge).toEqual([])

    // ── Resolving it ────────────────────────────────────────────────────
    //
    // The conflict on screen is rendered from the payload above: the group's
    // subtitle is the level id the server matched on, which is what ties the
    // row being resolved to the row in the response.
    await expect(
      dialog.getByText(`ID ${AIRBORNE_ROBOTS.inGameId}`, { exact: true })
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Use imported for all' }).click()

    const started = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().endsWith('/v1/me/import/start')
    )
    // Registered before the commit rather than after it: a job that finished
    // before the first poll came back would otherwise never be observed as
    // `completed` by anything this test waits on.
    const completed = page.waitForResponse(
      async (r) => {
        if (!r.url().endsWith('/v1/me/import/status')) return false
        const body = (await r.json()) as StatusResponse
        return body.data?.status === 'completed'
      },
      { timeout: 120_000 }
    )

    await dialog.getByRole('button', { name: 'Resolve 1 level' }).click()

    // ── /start: the resolution travelling back ──────────────────────────
    const start = await started
    expect(start.status()).toBe(202)
    expect(((await start.json()) as { jobId: string }).jobId).toBeTruthy()

    // The request body, not just the response: `resolution` is the client's
    // entire contribution to the commit, and the only thing distinguishing
    // "overwrite this completion" from "leave it alone". Every field of the
    // conflicting row resolved to the imported value, which the wizard reports
    // as an overwrite rather than a merge; the two rows that did not conflict
    // carry no resolution at all.
    const sent = start.request().postDataJSON() as StartRequest
    expect(
      sent.rows.map((r) => [r.rowIndex, r.type, r.resolution ?? null])
    ).toEqual([
      [0, 'completion', 'overwrite'],
      [1, 'completion', null],
      [2, 'completion', null],
    ])

    // ── The polled job ──────────────────────────────────────────────────
    const status = ((await (await completed).json()) as StatusResponse).data
    expect(status.totalRows).toBe(3)
    // One row per outcome, which is what makes this worth asserting whole:
    // `updated` is the resolved conflict, `committed` the new level, `failed`
    // the unresolvable name. A resolution that failed to reach the worker would
    // show up here as `skipped` instead of `updated` — the silent no-op this
    // spec exists to catch.
    expect(status.outcomeCounts).toEqual({
      committed: 1,
      updated: 1,
      skipped: 0,
      failed: 1,
    })

    expect(status.flaggedRows).toHaveLength(1)
    const flagged = status.flaggedRows[0]!
    expect(flagged.rowIndex).toBe(2)
    expect(flagged.levelName).toBe(UNRESOLVABLE_NAME)
    expect(flagged.issueMessage).toContain('Level not found')
    expect(flagged.resolved).toBe(false)

    await expect(dialog.getByText('Import complete')).toBeVisible()

    // ── PATCH .../rows/{rowId}/resolve ──────────────────────────────────
    //
    // The row id is server-minted and reaches the client only through the
    // status payload, so asserting it back on the request URL is the round
    // trip: the panel answers the row the server flagged, not an index the
    // client counted for itself.
    await dialog.getByRole('button', { name: /need review/ }).click()
    const rowResolved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/v1/me/import/rows/')
    )
    await dialog.getByRole('button', { name: 'Resolve', exact: true }).click()
    const resolvedResponse = await rowResolved
    expect(resolvedResponse.status()).toBe(200)
    expect(resolvedResponse.url()).toContain(
      `/v1/me/import/rows/${flagged.id}/resolve`
    )
    // Read back from the server's own list rather than from the click: the
    // mutation invalidates the status query instead of writing the flag
    // locally, so this header only changes once a fresh GET says every flagged
    // row is answered.
    await expect(dialog.getByText('All flagged rows resolved')).toBeVisible()

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()

    // ── GET /v1/me/export: the round trip closed ────────────────────────
    //
    // The export is the other half of the identity the import format is
    // designed around, and the only assertion here that reads the imported rows
    // back out through a different endpoint than the one that wrote them.
    const exported = page.waitForResponse(exportSection('completions'))
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()

    const { items } = (await (await exported).json()) as {
      items: ExportCompletion[]
    }
    // By level id, never by position or count: the export carries every
    // completion the account holds, and what else is in there depends on which
    // specs have already run.
    const byLevel = new Map(items.map((c) => [c.levelId, c]))

    // The resolved conflict, as the database now holds it — the one assertion
    // that proves the overwrite landed rather than merely being reported as
    // landed. The count here is the sheet's, not the one logged through the
    // wizard.
    expect(byLevel.get(AIRBORNE_ROBOTS.inGameId)?.attempts).toBe(
      IMPORTED_ATTEMPTS
    )

    // The inserted row. Its name comes from the levels cache rather than from
    // the sheet, so it also says the import wrote against the real level
    // instead of creating a stub out of the row's own text.
    const inserted = byLevel.get(PAYLOAD.inGameId)
    expect(inserted?.attempts).toBe(INSERTED_ATTEMPTS)
    expect(inserted?.levelName).toBe(PAYLOAD.name)

    // The workbook itself is built in the browser out of those sections, so the
    // download firing is what says the last step of the export path ran at all
    // — the JSON above would be identical if it had thrown.
    expect((await download).suggestedFilename()).toMatch(
      /^infernolog-export-\d{4}-\d{2}-\d{2}\.xlsx$/
    )
  })
})
