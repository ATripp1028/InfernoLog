import type { Page } from '@playwright/test'
import { expect, test } from './testBase'
import { logCompletion } from './flows'
import {
  CLUBSTEP,
  DEADLOCKED,
  THEORY_OF_EVERYTHING_2,
  type FixtureLevel,
} from './fixtures/levels'

// Log a completion, then place it in the ranking — the two flows the suite
// exists for, in the order a user actually performs them ("Place now" on the
// success card routes straight to /ranking).
//
// What is asserted is the round trip, not the rendering: every step here
// crosses the wire to the staging API, so a response shape that changed on the
// server fails this spec and nothing else in the repo. Step copy, disabled
// states and validation messages belong in the component specs.

// The whole file runs at a mobile viewport. Not for coverage of the mobile
// layout — the API calls are identical at both breakpoints — but because every
// affordance these flows need is a real button below `md`, where on desktop
// the ranking board places by drag-and-drop (dnd-kit). Driving a drag is the
// single most reliable way to make an E2E suite flaky, and it would be
// asserting dnd-kit rather than our contract.
test.use({ viewport: { width: 390, height: 844 } })

/**
 * A ranked row, which renders as `#<rank> — <name>` (em dash).
 *
 * The row is a plain div while edit mode is on and a link while it is off, so
 * this matches on text rather than role.
 */
function rankedRow(page: Page, rank: number, level: FixtureLevel) {
  return page.getByText(`#${rank} \u2014 ${level.name}`)
}

/**
 * Places the named level from the unplaced sheet.
 *
 * Placement drops the level in at #1, closes the sheet, and switches the list
 * into edit mode — all three of which the caller inherits.
 *
 * Nothing here counts unplaced levels. The bar's accessible name is
 * "<n> unplaced level(s) View →", and matching a specific `n` couples this
 * spec to what every earlier spec left behind: the completion spec above logs
 * a level and defers placing it, so by the time this runs there is already one
 * in the sheet. The reset is once per run, not once per spec, so a spec that
 * reads a count is a spec that only passes in one position in the file.
 */
async function placeFromUnplaced(page: Page, level: FixtureLevel) {
  const sheet = page.getByRole('dialog', { name: 'Unplaced levels' })

  await page.getByRole('button', { name: /unplaced level/ }).click()

  // Scoped to the sheet: the level's name also appears in the ranked rows
  // behind it, and once placed it appears there too.
  await sheet.getByRole('button', { name: new RegExp(level.name) }).click()

  // The sheet closing is what confirms the placement went through — and unlike
  // a count, it means the same thing however many levels are still unplaced.
  await expect(sheet).toBeHidden()
}

test.describe('completion', () => {
  test('logs a completion and shows it on the list', async ({ page }) => {
    await page.goto('/list')

    await logCompletion(page, CLUBSTEP, '1337')
    await page.getByRole('button', { name: 'Place later' }).click()

    // Reload rather than trusting the post-mutation cache: what this spec is
    // for is the server's view of what was written.
    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Open Clubstep details' })
    ).toBeVisible()
  })

  test('places completions in the ranking and reorders them', async ({
    page,
  }) => {
    await page.goto('/ranking')

    // Two completions, not one: placement always drops a level in at #1, and
    // `move` is a no-op at either end of the list — so a single placed entry
    // can never be reordered and the PATCH would never be exercised.
    await logCompletion(page, THEORY_OF_EVERYTHING_2, '42')
    await page.getByRole('button', { name: 'Place now' }).click()
    await expect(page).toHaveURL(/\/ranking/)
    await placeFromUnplaced(page, THEORY_OF_EVERYTHING_2)
    await expect(rankedRow(page, 1, THEORY_OF_EVERYTHING_2)).toBeVisible()

    // "Place later" just closes the modal, leaving us on /ranking with the new
    // completion sitting in Unplaced.
    await logCompletion(page, DEADLOCKED, '7')
    await page.getByRole('button', { name: 'Place later' }).click()
    await placeFromUnplaced(page, DEADLOCKED)

    // Newest placement goes on top, pushing the first one down.
    await expect(rankedRow(page, 1, DEADLOCKED)).toBeVisible()
    await expect(rankedRow(page, 2, THEORY_OF_EVERYTHING_2)).toBeVisible()

    // Reordering is a PATCH to a different endpoint than the POST that placed
    // them, so it is its own contract. Note there is no "Edit" click here:
    // placing already turned edit mode on, so that toggle now reads "Done" —
    // clicking it would take the move buttons away.
    //
    // Waiting on the response rather than the "Ranking saved" toast, because
    // placing raises that same toast (place and reorder share a mutation key),
    // so a toast assertion here could match the earlier one and pass without
    // the reorder ever landing.
    const reordered = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        /\/v1\/me\/ranking\/classic\//.test(r.url())
    )
    await page.getByRole('button', { name: 'Move down' }).first().click()
    expect((await reordered).status()).toBe(200)

    await page.reload()
    await expect(rankedRow(page, 1, THEORY_OF_EVERYTHING_2)).toBeVisible()
    await expect(rankedRow(page, 2, DEADLOCKED)).toBeVisible()
  })
})
