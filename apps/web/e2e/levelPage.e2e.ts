import type { Page } from '@playwright/test'
import { expect, test } from './testBase'
import {
  findLevel,
  levelCard,
  logCompletion,
  logRun,
  onScreen,
  openLevelPage,
  openQuickAction,
} from './flows'
import { BLAST_PROCESSING, GEOMETRICAL_DOMINATOR } from './fixtures/levels'

// The level page's own write paths — the ones reached from the page rather
// than from the logging flow, and the ones no other spec touches:
//
//   PATCH  /v1/me/progress/{levelId}          via EditLevelModal
//   DELETE /v1/me/progress/{levelId}/updates/{progressUpdateId}
//   DELETE /v1/me/progress/{levelId}
//
// progress.e2e.ts already PATCHes that first URL, but through EditRunModal,
// which writes the *ProgressUpdate* half of EditProgressInputSchema. This file
// writes the other half — the LevelProgress columns — and they share nothing
// but the route: ratings, the worst-fail date/zone pair, the coin bitmask,
// per-entry visibility and the GDDL tier are all separate columns with
// separate conversions.
//
// Two of those conversions are why this file is worth its runtime, both being
// the shape that drifts with nothing failing:
//
//   - Ratings are stored as integers 0-100 whatever the user's display scale
//     is, and converted at the display layer alone (lib/ratingScale). The E2E
//     user is on ZERO_TO_TEN, so 8.5 has to arrive as 85 and come back as
//     8.5. A server that started storing display units still returns a
//     number, and every component spec still passes against its fixtures.
//   - `worstFailDate` carries its own optional time + IANA zone, in a
//     separate column pair from `ProgressUpdate.date`'s — so progress.e2e.ts
//     pinning that one says nothing about this one. The worst fail below is
//     entered at a wall-clock time whose UTC instant falls on a different
//     calendar day, so a dropped zone cannot look like success.
//
// `deletedLevelProgress` is the third. Deleting a level's last logged entry
// deletes the whole LevelProgress server-side, and that flag in the response
// is the only thing telling the client to navigate away rather than re-render
// a page whose entry no longer exists. Nothing renders it, so the specs below
// assert it off the response body directly.
//
// Both levels here are created and destroyed by the spec that owns them.

// Mobile viewport, for the reason completion.e2e.ts gives: every affordance
// these flows need is a plain button below `md`, where on desktop the FAB's
// secondary actions exist only while the speed dial is hovered.
//
// The browser's zone is pinned because both edit surfaces default their
// timezone field to the viewer's (getViewerTimezone); every zone asserted on
// below is set explicitly, so nothing depends on this value.
test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' })

// Every getByLabel below is `exact`, for the reason progress.e2e.ts gives:
// label matching is substring and case-insensitive, and this modal carries
// "Worst fail %" alongside "Worst fail date".

// A zone with no DST, so a fixed wall-clock date can never land in a
// spring-forward gap and fail the spec once a year. 01:15 in Dubai is 21:15
// UTC on the *previous* day — read back without the zone, the worst fail
// moves to 2026-05-08.
//
// It also has to be a zone the select actually offers, which is a narrower
// set than "valid IANA zone": the options come from
// `Intl.supportedValuesOf('timeZone')`, and Chromium answers that from ICU's
// canonical names, which lag IANA's renames. `Asia/Kolkata` is absent there —
// Chromium still lists it as `Asia/Calcutta` — and selectOption fails with
// "did not find some options" rather than anything about timezones. Prefer a
// zone whose name has never been renamed.
const WORST_FAIL_ZONE = 'Asia/Dubai'
const WORST_FAIL_DATE = '2026-05-09'
const WORST_FAIL_TIME = '01:15'

const LEVEL_NOTES = 'E2E: the wave section is the whole level.'

// Display units on the E2E user's ZERO_TO_TEN scale; 85 internally.
const RATING = '8.5'
const GDDL_TIER = '27'

// Distinct percentages, so which of the two runs survived a delete is
// unambiguous. Their dates differ only to keep the timeline honest.
const FIRST_RUN = '40'
const FIRST_RUN_DATE = '2026-01-12'
const SECOND_RUN = '72'
const SECOND_RUN_DATE = '2026-01-27'

/**
 * Opens EditLevelModal from the notes card's Edit button.
 *
 * `first()` is load-bearing and stable: the timeline's completion and drop
 * cards carry an "Edit" button with the same accessible name, and the notes
 * card precedes the timeline in the DOM in both layouts (mobile stacks them
 * in that order; desktop puts notes in the left column and the timeline in
 * the right, and the left column is written first). The empty-notes state's
 * "+ Add notes about this level" is unambiguous but exists only until the
 * first save, so it is not the locator to build on.
 */
async function openEditLevel(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit level details' })
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * Confirms one of the page's destructive AlertDialogs and returns the response
 * to the DELETE it fired.
 *
 * The dialog does not close itself on confirm — the mutation's success handler
 * does — so awaiting the response is also what says the write landed rather
 * than the button merely having been clicked.
 */
async function confirmDelete(page: Page, title: string, urlEnd: RegExp) {
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  const responded = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && urlEnd.test(r.url())
  )
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  return await responded
}

test.describe('level page', () => {
  test('edits the level-scoped fields, reads them back, and deletes the level', async ({
    page,
  }) => {
    await page.goto('/list')

    // A completion rather than a run: the modal's GDDL tier and coin sections
    // render only for a beaten level, and they are half the payload this spec
    // is here to pin.
    await logCompletion(page, BLAST_PROCESSING, '1337')
    await page.getByRole('button', { name: 'Place later' }).click()

    await openLevelPage(page, BLAST_PROCESSING)

    const dialog = await openEditLevel(page)

    await dialog.getByLabel('Worst fail %', { exact: true }).fill('44')
    await dialog
      .getByLabel('Worst fail date', { exact: true })
      .fill(WORST_FAIL_DATE)
    // Order matters: the zone select is not rendered at all until the time
    // field is non-empty (DateTimeField), since a date with no time of day
    // has no zone to be in.
    await dialog
      .getByLabel('Time (optional)', { exact: true })
      .fill(WORST_FAIL_TIME)
    await dialog
      .getByLabel('Timezone', { exact: true })
      .selectOption(WORST_FAIL_ZONE)

    // The coin bitmask — bit 1 is coin 2, so this stores 2, not 1. Blast
    // Processing is a main level, so it has three coins to pick from.
    await dialog.getByRole('button', { name: 'Coin 2 (not collected)' }).click()

    // The stepper commits on blur, not on input, so a bare fill() would be
    // discarded. Enter blurs it (see StepperInput's onKeyDown).
    const score = dialog.getByLabel('Score', { exact: true })
    await score.fill(RATING)
    await score.press('Enter')

    await dialog
      .getByLabel('Your tier opinion', { exact: true })
      .fill(GDDL_TIER)
    await dialog
      .getByLabel('About this level', { exact: true })
      .fill(LEVEL_NOTES)
    // Per-entry visibility, independent of the profile-wide setting.
    await dialog.getByRole('switch').click()

    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().endsWith(`/v1/me/progress/${BLAST_PROCESSING.inGameId}`)
    )
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    expect((await saved).status()).toBe(200)
    await expect(dialog).toBeHidden()

    // A fresh load, so what is asserted is the server's answer rather than the
    // cache the mutation just primed.
    await page.reload()
    await expect(onScreen(page.getByText(LEVEL_NOTES))).toBeVisible()
    // The stat grid's RATING box. `8.5` on the page means `85` in the column —
    // this is the display-scale round trip, and the assertion is exact because
    // a substring would also match a hypothetical `8.55`.
    await expect(
      onScreen(page.getByText(RATING, { exact: true }))
    ).toBeVisible()
    await expect(onScreen(page.getByText('44%', { exact: true }))).toBeVisible()

    // Everything else this modal writes is stored but never rendered on the
    // page, so the modal itself is how it is read back — it initialises from
    // the same GET the page renders from.
    const reopened = await openEditLevel(page)
    await expect(
      reopened.getByLabel('Worst fail date', { exact: true })
    ).toHaveValue(WORST_FAIL_DATE)
    await expect(
      reopened.getByLabel('Time (optional)', { exact: true })
    ).toHaveValue(WORST_FAIL_TIME)
    await expect(reopened.getByLabel('Timezone', { exact: true })).toHaveValue(
      WORST_FAIL_ZONE
    )
    await expect(
      reopened.getByLabel('Your tier opinion', { exact: true })
    ).toHaveValue(GDDL_TIER)
    await expect(reopened.getByLabel('Score', { exact: true })).toHaveValue(
      RATING
    )
    // The coin's accessible name carries its own state, so its presence is
    // the assertion — and "Coin 2 (collected)" is not a substring of the
    // uncollected label, so the match cannot be satisfied by the wrong one.
    await expect(
      reopened.getByRole('button', { name: 'Coin 2 (collected)' })
    ).toBeVisible()
    await expect(reopened.getByRole('switch')).toBeChecked()
    await reopened.getByRole('button', { name: 'Cancel' }).click()

    // Deleting the whole entry is its own endpoint, and the level page's FAB
    // is the only place in the app that calls it. Folded in here rather than
    // given a spec of its own because it needs exactly the state this test
    // has already built — and it leaves the fixture level clean for the next
    // run either way.
    await openQuickAction(page, 'Delete this level', 'Edit this entry')
    const deleted = await confirmDelete(
      page,
      'Delete this level?',
      new RegExp(`/v1/me/progress/${BLAST_PROCESSING.inGameId}$`)
    )
    expect(deleted.status()).toBe(200)

    await expect(page).toHaveURL(/\/list$/)
    await page.reload()
    await expect(levelCard(page, BLAST_PROCESSING)).toBeHidden()
  })

  test('deletes one logged entry, then the last one', async ({ page }) => {
    await page.goto('/list')

    // The first run goes in through the List's FAB, which walks the find step.
    await openQuickAction(page, 'Log progress')
    await findLevel(page, GEOMETRICAL_DOMINATOR)
    await logRun(page, FIRST_RUN, FIRST_RUN_DATE)

    await openLevelPage(page, GEOMETRICAL_DOMINATOR)

    // The second goes in through the level page's own FAB, which resolves the
    // level it is already on (openForEdit → ResolvingStep) and skips the find
    // step entirely — a path no other spec exercises.
    await openQuickAction(page, 'Log progress', 'Edit this entry')
    await logRun(page, SECOND_RUN, SECOND_RUN_DATE)

    await page.reload()
    const firstRun = onScreen(page.getByText(`${FIRST_RUN}%`, { exact: true }))
    const secondRun = onScreen(
      page.getByText(`${SECOND_RUN}%`, { exact: true })
    )
    // Exact, because the runs graph under the timeline labels the same runs
    // "40% from 0" and "72% from 0".
    await expect(firstRun).toBeVisible()
    await expect(secondRun).toBeVisible()

    // The timeline is newest-first, so the first delete button is the second
    // run's. Which one actually went is asserted below rather than assumed.
    await page.getByRole('button', { name: 'Delete entry' }).first().click()
    const updatesUrl = new RegExp(
      `/v1/me/progress/${GEOMETRICAL_DOMINATOR.inGameId}/updates/`
    )
    const removedOne = await confirmDelete(
      page,
      'Delete this entry?',
      updatesUrl
    )
    expect(removedOne.status()).toBe(200)
    // The level still has an entry, so the LevelProgress row survives — and
    // the client stays put on the strength of this flag alone.
    expect((await removedOne.json()).data.deletedLevelProgress).toBe(false)

    await page.reload()
    await expect(secondRun).toBeHidden()
    await expect(firstRun).toBeVisible()

    await page.getByRole('button', { name: 'Delete entry' }).click()
    const removedLast = await confirmDelete(
      page,
      'Delete this entry?',
      updatesUrl
    )
    expect(removedLast.status()).toBe(200)
    // The other half of the flag: the last update taking the whole
    // LevelProgress with it is what sends the client back to the List.
    expect((await removedLast.json()).data.deletedLevelProgress).toBe(true)

    await expect(page).toHaveURL(/\/list$/)
    await page.reload()
    await expect(levelCard(page, GEOMETRICAL_DOMINATOR)).toBeHidden()
  })
})
