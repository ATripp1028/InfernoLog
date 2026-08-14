import { expect, test, type Page } from '@playwright/test'
import { CLUBSTEP, THEORY_OF_EVERYTHING_2 } from './fixtures/levels'

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
 * Opens the logging flow from the mobile FAB.
 *
 * The FAB itself is labelled with the primary action, and tapping it opens a
 * `role="menu"` sheet whose rows carry the same labels — so the sheet row has
 * to be scoped to the menu or the locator matches two elements.
 */
async function openLoggingFlow(page: Page, action: string) {
  await page.getByRole('button', { name: 'Log a completion' }).click()
  await page
    .getByRole('menu', { name: 'Quick actions' })
    .getByRole('button', { name: action })
    .click()
}

/**
 * Walks the completion wizard from the FAB to the success card.
 *
 * The wizard is four "Continue" steps plus a review. `c_gddl` would add a
 * fifth, but only for a user with a GDDL key connected — which is why the
 * reset script clears it.
 */
async function logCompletion(
  page: Page,
  level: { name: string },
  attempts: string
) {
  await openLoggingFlow(page, 'Log a completion')

  // Search by NAME, not by ID. The find step only previews a typed ID at four
  // or more digits, and below that treats it as an unknown level to fetch live
  // from RobTop's servers — the fixture levels are official, so their IDs are
  // one and two digits. A name search hits the cache, which is where they are.
  await page.getByLabel('Level ID or name').fill(level.name)
  await page.getByRole('button', { name: new RegExp(level.name) }).click()

  await page.getByLabel('Attempts').fill(attempts)
  await page.getByRole('button', { name: 'Continue' }).click() // basics → rating
  await page.getByRole('button', { name: 'Continue' }).click() // rating → session
  await page.getByRole('button', { name: 'Continue' }).click() // session → refs
  await page.getByRole('button', { name: 'Continue' }).click() // refs → review

  await expect(page.getByRole('heading', { name: 'Looks good?' })).toBeVisible()
  await page.getByRole('button', { name: 'Log completion' }).click()

  await expect(
    page.getByRole('heading', { name: `${level.name} logged` })
  ).toBeVisible()
}

test.describe('completion', () => {
  test('logs a completion and shows it on the list', async ({ page }) => {
    await page.goto('/list')

    await logCompletion(page, CLUBSTEP, '1337')
    await page.getByRole('button', { name: 'Place later' }).click()

    // Reload rather than trusting the post-mutation cache: what this spec is
    // for is the server's view of what was written.
    await page.reload()
    await expect(page.getByText(CLUBSTEP.name)).toBeVisible()
  })

  test('places a logged completion in the ranking', async ({ page }) => {
    await page.goto('/ranking')

    await logCompletion(page, THEORY_OF_EVERYTHING_2, '42')
    await page.getByRole('button', { name: 'Place now' }).click()

    await expect(page).toHaveURL(/\/ranking/)

    // The unplaced bar's accessible name is "<n> unplaced level(s) View →",
    // so these are substring matches rather than exact ones.
    await page.getByRole('button', { name: /1 unplaced level/ }).click()
    await page
      .getByRole('button', { name: new RegExp(THEORY_OF_EVERYTHING_2.name) })
      .click()
    await expect(
      page.getByRole('button', { name: /0 unplaced levels/ })
    ).toBeVisible()

    // Reorder mutations are queued and drained by ReorderSyncWatcher in
    // _authenticated.tsx, which toasts once the batch settles. That toast is
    // the signal the write reached the server, not just the cache — waiting on
    // it is what makes the reload below meaningful.
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Move up' }).first().click()
    await expect(page.getByText('Ranking saved')).toBeVisible()

    await page.reload()
    await expect(page.getByText(THEORY_OF_EVERYTHING_2.name)).toBeVisible()
  })
})
