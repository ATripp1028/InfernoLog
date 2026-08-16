// Multi-step flows more than one spec has to drive, kept here so a wizard that
// gains a step is fixed once rather than in every spec that walks it.
//
// Deliberately not named `*.e2e.ts`: playwright.config.ts matches that glob, and
// a helper module picked up as a spec fails as "no tests found".

import { expect, type Page } from '@playwright/test'
import type { FixtureLevel } from './fixtures/levels'

/**
 * Opens one of the FAB's quick actions from the mobile bottom sheet.
 *
 * Only valid on a page that has not overridden the FAB (List, Ranking, ...) —
 * hence the hardcoded "Log a completion", which is the default action set's
 * primary and so the label the FAB itself carries. Tapping it opens a
 * `role="menu"` sheet whose rows carry the same labels, so the sheet row has
 * to be scoped to the menu or the locator matches two elements.
 */
export async function openQuickAction(page: Page, action: string) {
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
 *
 * Leaves the success card open: the caller picks "Place now" or "Place later".
 */
export async function logCompletion(
  page: Page,
  level: FixtureLevel,
  attempts: string
) {
  await openQuickAction(page, 'Log a completion')

  // Search by NAME, not by ID. The find step only previews a typed ID at four
  // or more digits, and below that treats it as an unknown level to fetch live
  // from RobTop's servers — the fixture levels are official, so their IDs are
  // one and two digits. A name search hits the cache, which is where they are.
  await page.getByLabel('Level ID or name').fill(level.name)
  await page
    .getByRole('button', {
      name: new RegExp(level.name + ' by ' + level.creator),
    })
    .click()

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
