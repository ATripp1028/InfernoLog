// Multi-step flows more than one spec has to drive, kept here so a wizard that
// gains a step is fixed once rather than in every spec that walks it — plus
// the handful of locator helpers that go with them.
//
// Deliberately not named `*.e2e.ts`: playwright.config.ts matches that glob, and
// a helper module picked up as a spec fails as "no tests found".

import { expect, type Locator, type Page } from '@playwright/test'
import type { FixtureLevel } from './fixtures/levels'

/**
 * Opens one of the FAB's quick actions from the mobile bottom sheet.
 *
 * The FAB carries its own primary action's label as its accessible name
 * (`MobileNav`'s FabSlot), so `fabLabel` is which action set the page has
 * registered — the default logging set's "Log a completion" on List, Ranking
 * and the rest, and "Edit this entry" on a level page the user owns
 * (`useLevelDetailPage`'s override, whose first entry is the primary).
 * Tapping it opens a `role="menu"` sheet whose rows carry the same labels,
 * so the sheet row has to be scoped to the menu or the locator matches two
 * elements.
 */
export async function openQuickAction(
  page: Page,
  action: string,
  fabLabel = 'Log a completion'
) {
  await page.getByRole('button', { name: fabLabel }).click()
  await page
    .getByRole('menu', { name: 'Quick actions' })
    .getByRole('button', { name: action })
    .click()
}

/**
 * Narrows a text locator to the copy this viewport actually shows.
 *
 * The level page renders its whole layout twice — a `md:hidden` mobile column
 * and a `hidden md:block` desktop one, both always in the DOM — so anything
 * matched inside it matches twice and trips strict mode. Only text locators
 * need this: `getByRole` already skips elements `display: none` keeps out of
 * the accessibility tree, which is why the FAB and the List's two layouts
 * need no such handling elsewhere in the suite.
 */
export function onScreen(locator: Locator): Locator {
  return locator.filter({ visible: true })
}

/**
 * The level's own page, reached by URL rather than through the List.
 *
 * Deep-linking on purpose: the List's card for a given level is only reachable
 * if it sorts onto the screen, which depends on what every other spec has
 * already logged. The fixture's in-game id is fixed, so this is the one route
 * in that cannot be perturbed by execution order. The List round trip is
 * completion.e2e.ts's assertion, not any level-page spec's.
 */
export async function openLevelPage(page: Page, level: FixtureLevel) {
  await page.goto(`/list/${level.inGameId}`)
  // Past the skeleton — the callers read the timeline, and an absence asserted
  // against a page still loading is true for the wrong reason.
  await expect(onScreen(page.getByText('Progress timeline'))).toBeVisible()
}

/**
 * Picks a level in the logging flow's find step, whichever path opened it.
 *
 * Search by NAME, not by ID. The find step only previews a typed ID at four
 * or more digits, and below that treats it as an unknown level to fetch live
 * from RobTop's servers — the fixture levels are official, so their IDs are
 * one and two digits. A name search hits the cache, which is where they are.
 *
 * Selecting a row resolves the level against the API, so the step that follows
 * is what the caller should wait on.
 */
export async function findLevel(page: Page, level: FixtureLevel) {
  await page.getByLabel('Level ID or name').fill(level.name)
  await page
    .getByRole('button', {
      name: new RegExp(level.name + ' by ' + level.creator),
    })
    .click()
}

/**
 * Walks the completion wizard from the FAB to the success card.
 *
 * The wizard is four "Continue" steps plus a review. `c_gddl` would add a
 * fifth, but only for a user with a GDDL key connected — which is why the
 * reset script clears it.
 *
 * Leaves the success card open: the caller picks "Place now" or "Place later".
 */
export async function logCompletion(
  page: Page,
  level: FixtureLevel,
  attempts: string
) {
  await openQuickAction(page, 'Log a completion')
  await findLevel(page, level)

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
