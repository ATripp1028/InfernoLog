import { expect, test } from './testBase'
import { findLevel, onScreen, openLevelPage, openQuickAction } from './flows'
import { ELECTRODYNAMIX, HEXAGON_FORCE } from './fixtures/levels'

// The two write paths a completion does not cover: POST /v1/me/progress (a run
// on a level that is not beaten yet) and POST /v1/me/drops, plus the edit of
// that run through PATCH /v1/me/progress/{levelId}.
//
// They are separate endpoints taking separate payload shapes — a progress
// update is a discriminated union on `mode` (from_zero vs from_run), a drop
// carries worst-fail fields a completion never sends — so completion.e2e.ts
// passing says nothing about either.
//
// What each spec pins hardest is the optional time + IANA timezone on
// ProgressUpdate.date. That pair is exactly the shape that drifts without
// anything failing: a server that stopped storing `dateTimezone` still
// returns a valid date, every component spec still passes against its
// fixtures, and the only visible symptom is an entry redisplaying on the
// wrong calendar day. The runs here are logged at a wall-clock time whose UTC
// instant falls on a *different* date, so dropping the zone cannot look like
// success.

// Mobile viewport, for the reason completion.e2e.ts gives: every affordance
// these flows need is a plain button below `md`, where on desktop the FAB's
// secondary actions exist only while the speed dial is hovered.
//
// The browser's own zone is pinned because the logging flow defaults its
// timezone field to whatever the viewer is in (getViewerTimezone) — pinning
// keeps what these specs write the same on a laptop as in CI. Every zone the
// specs then assert on is set explicitly, so none of it depends on this value.
test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' })

// Every getByLabel here is `exact`. Label matching is substring and
// case-insensitive, and both surfaces these specs drive carry labels that
// contain one another — "This run" is inside the edit modal's "Notes on this
// run", "Attempts" inside the drop step's "Attempts (optional)". Left
// inexact, the locator resolves to two elements and the spec fails on
// strictness rather than on anything it meant to assert.

// A zone with no DST, deliberately: zonedTimeToUtc rejects a wall-clock time
// that a spring-forward skipped, and a fixed date near a transition in some
// other zone would be a spec that fails once a year.
const RUN_ZONE = 'Asia/Tokyo'
const RUN_DATE = '2026-03-14'
// Both times are before 09:00, which is the whole point: Tokyo is UTC+9, so
// 00:30 there is 15:30 UTC on the 13th and 08:15 is 23:15 UTC on the 13th.
// Read back without the zone, either one lands the entry on the previous day.
// A time at or after 09:00 would keep the same UTC date and let a dropped
// `dateTimezone` pass the date assertions unnoticed.
const RUN_TIME = '00:30'
const EDITED_TIME = '08:15'

const DROP_DATE = '2026-02-02'
const DROP_REASON = 'E2E: setting this one aside.'

test.describe('progress and drops', () => {
  test('logs a run on an unbeaten level and edits it', async ({ page }) => {
    await page.goto('/log')
    await openQuickAction(page, 'Log progress')
    await findLevel(page, ELECTRODYNAMIX)

    // Step 1 of 2 — the run itself. "63" parses as a run from 0%, which is
    // the `mode: 'from_zero'` arm of ProgressInputSchema; the edit below
    // switches it to the other arm.
    await page.getByLabel('This run', { exact: true }).fill('63')
    await page.getByLabel('Date', { exact: true }).fill(RUN_DATE)
    await page.getByLabel('Time (optional)', { exact: true }).fill(RUN_TIME)
    await page.getByLabel('Timezone', { exact: true }).selectOption(RUN_ZONE)
    await page.getByLabel('Attempts', { exact: true }).fill('1200')
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 2 of 2 is entirely optional fields; the submit is the point.
    // Waiting on the POST rather than the toast, and asserting its status,
    // names the endpoint under test — the flow's own success toast would
    // read the same whatever the server returned.
    const logged = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().endsWith('/v1/me/progress')
    )
    await page.getByRole('button', { name: 'Log progress' }).click()
    expect((await logged).status()).toBe(201)
    await expect(page.getByRole('dialog')).toBeHidden()

    // A fresh navigation, so what is rendered is the server's answer rather
    // than the cache the mutation just primed.
    await openLevelPage(page, ELECTRODYNAMIX)
    // Exact, because the runs graph below the timeline labels the same run
    // "63% from 0" — a substring match would find two elements and fail on
    // strictness rather than on the entry.
    await expect(onScreen(page.getByText('63%', { exact: true }))).toBeVisible()
    await expect(onScreen(page.getByText('1,200 attempts'))).toBeVisible()

    // The edit modal reads its fields straight off the API response, so
    // opening it is how the stored date/time/zone triple is read back. A
    // dropped `dateTimezone` shows up here as 2026-03-13 with an empty time,
    // not as an error.
    const dialog = page.getByRole('dialog', { name: 'Edit run' })
    await page.getByRole('button', { name: 'Edit entry' }).click()
    await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(
      RUN_DATE
    )
    await expect(
      dialog.getByLabel('Time (optional)', { exact: true })
    ).toHaveValue(RUN_TIME)
    await expect(dialog.getByLabel('Timezone', { exact: true })).toHaveValue(
      RUN_ZONE
    )

    // The PATCH is a different endpoint with a different payload than the POST
    // above — every field optional, only what is present written. Switching
    // the run from a single percentage to a range moves it onto the other arm
    // of that union, which is the half `mode: 'from_zero'` above never covers.
    await dialog.getByLabel('This run', { exact: true }).fill('52-87')
    await dialog.getByLabel('Attempts', { exact: true }).fill('4096')
    await dialog
      .getByLabel('Time (optional)', { exact: true })
      .fill(EDITED_TIME)

    const edited = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().endsWith(`/v1/me/progress/${ELECTRODYNAMIX.inGameId}`)
    )
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    expect((await edited).status()).toBe(200)
    await expect(dialog).toBeHidden()

    await page.reload()
    await expect(onScreen(page.getByText('4,096 attempts'))).toBeVisible()

    // The rest of the edit is read back through the modal again. The run is
    // asserted here rather than off the timeline because the timeline and the
    // runs graph label a range with the same string — and unlike the timeline,
    // this is the value the server sent, not a label derived from it.
    await page.getByRole('button', { name: 'Edit entry' }).click()
    await expect(dialog.getByLabel('This run', { exact: true })).toHaveValue(
      '52-87'
    )
    await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(
      RUN_DATE
    )
    await expect(
      dialog.getByLabel('Time (optional)', { exact: true })
    ).toHaveValue(EDITED_TIME)
    await expect(dialog.getByLabel('Timezone', { exact: true })).toHaveValue(
      RUN_ZONE
    )
  })

  test('drops a level', async ({ page }) => {
    await page.goto('/log')
    await openQuickAction(page, 'Drop a level')
    await findLevel(page, HEXAGON_FORCE)

    // The drop is a single step. Its date is left time-less on purpose: that
    // sends the other half of the date convention the run above covers — a
    // bare `yyyy-MM-dd` with a null `dateTimezone`, rather than a UTC instant
    // and the zone it was entered in. Two shapes, one field, one schema.
    await page.getByLabel('Date dropped', { exact: true }).fill(DROP_DATE)
    await page.getByLabel('Attempts (optional)', { exact: true }).fill('8000')
    // Worst fail lives on the LevelProgress row, not on the update — a field
    // only this endpoint and the completion write.
    await page.getByLabel('Worst fail %', { exact: true }).fill('44')
    await page
      .getByLabel('Reason (optional)', { exact: true })
      .fill(DROP_REASON)

    const dropped = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/v1/me/drops')
    )
    await page.getByRole('button', { name: 'Drop level' }).click()
    expect((await dropped).status()).toBe(201)
    await expect(page.getByRole('dialog')).toBeHidden()

    await openLevelPage(page, HEXAGON_FORCE)
    await expect(onScreen(page.getByText('⚑ Dropped'))).toBeVisible()
    await expect(onScreen(page.getByText(DROP_REASON))).toBeVisible()
    await expect(onScreen(page.getByText('8,000 attempts'))).toBeVisible()
    // The stat grid's WORST FAIL box — the LevelProgress field, read back.
    await expect(onScreen(page.getByText('44%', { exact: true }))).toBeVisible()
  })
})
