// Multi-step flows more than one spec has to drive, kept here so a wizard that
// gains a step is fixed once rather than in every spec that walks it — plus
// the handful of locator helpers that go with them.
//
// Deliberately not named `*.e2e.ts`: playwright.config.ts matches that glob, and
// a helper module picked up as a spec fails as "no tests found".

import { expect, type Locator, type Page } from '@playwright/test'
import type { FixtureLevel } from './fixtures/levels'

// lib/persister.ts's localStorage key, duplicated rather than imported for the
// reason fixtures/levels.ts gives about the API's constants — and because it
// is not exported. src/lib/tests/persister.spec.ts hardcodes it too.
const QUERY_CACHE_KEY = 'infernolog:query-cache'

/**
 * Reloads with the persisted react-query cache dropped, so the page that comes
 * back is the server's answer.
 *
 * A bare `page.reload()` is not a server read here. The query client persists
 * to localStorage (main.tsx's PersistQueryClientProvider) with a two-minute
 * `staleTime`, and a mutation that writes its result straight into the cache
 * with `setQueryData` rather than invalidating never went to the server at all
 * — so a spec that writes and reloads inside the same minute is re-reading
 * what it just wrote, and would pass against a server that persisted nothing.
 * Clearing the one key forces the GET.
 *
 * Amplify's session lives under its own `CognitoIdentityServiceProvider.*`
 * keys, so this does not sign the page out.
 */
export async function coldReload(page: Page) {
  await page.evaluate((key) => localStorage.removeItem(key), QUERY_CACHE_KEY)
  await page.reload()
}

/**
 * Opens one of the FAB's quick actions from the mobile bottom sheet.
 *
 * The FAB carries its own primary action's label as its accessible name
 * (`MobileNav`'s FabSlot), so `fabLabel` is which action set the page has
 * registered — the default logging set's "Log a completion" on Log, Demon List
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
 * the accessibility tree, which is why the FAB and the Log's two layouts
 * need no such handling elsewhere in the suite.
 */
export function onScreen(locator: Locator): Locator {
  return locator.filter({ visible: true })
}

/**
 * A level's card in the Log, located by the card's own accessible name.
 *
 * Mobile only, and that is not incidental: `MobilePager` is the one place in
 * the app that writes an `Open <name> details` label, so this locator does not
 * resolve at all above `md`, where the Log is a table. Every spec that uses it
 * runs at a mobile viewport for its own reasons anyway.
 *
 * Exact, so a level whose name is a prefix of another's cannot match both.
 */
export function levelCard(page: Page, level: FixtureLevel): Locator {
  return page.getByRole('button', {
    name: `Open ${level.name} details`,
    exact: true,
  })
}

/**
 * The level's own page, reached by URL rather than through the Log.
 *
 * Deep-linking on purpose: the Log's card for a given level is only reachable
 * if it sorts onto the screen, which depends on what every other spec has
 * already logged. The fixture's in-game id is fixed, so this is the one route
 * in that cannot be perturbed by execution order. The Log round trip is
 * completion.e2e.ts's assertion, not any level-page spec's.
 */
export async function openLevelPage(page: Page, level: FixtureLevel) {
  await page.goto(`/log/${level.inGameId}`)
  // Past the skeleton — the callers read the timeline, and an absence asserted
  // against a page still loading is true for the wrong reason.
  await expect(onScreen(page.getByText('Progress timeline'))).toBeVisible()
}

/**
 * A level's row in any search result list.
 *
 * The `<name> by <creator>` accessible name comes from
 * `components/data/LevelResultRow`, which the logging flow's find step and both
 * collection dialogs all render — so it is one fact with one owner, and belongs
 * here rather than being rebuilt per surface. The text *field* those surfaces
 * share is not: `Level ID or name` is written out independently in three
 * components, and a helper spanning them would let a label change in one break
 * specs driving another.
 */
export function levelResultRow(page: Page, level: FixtureLevel): Locator {
  return page.getByRole('button', {
    name: new RegExp(`${level.name} by ${level.creator}`),
  })
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
  await levelResultRow(page, level).click()
}

/**
 * Walks the completion wizard from the FAB to the success card.
 *
 * The wizard is four "Continue" steps plus a review. `c_gddl` would add a
 * fifth, but only for a user with a GDDL key connected — which is why the
 * reset script clears it.
 *
 * Leaves the success card open: the caller picks "Place now" or "Place later".
 *
 * @param rating - The rating to give the level, in **display** units — 0–10 on
 * the scale the reset leaves the user with — and SIMPLE mode only, which is
 * the mode it leaves them in. Omitted, the step is walked past and takes its
 * own default of the middle of the scale, which is what every completion in
 * this suite carries except the ones ranking.e2e.ts logs.
 */
export async function logCompletion(
  page: Page,
  level: FixtureLevel,
  attempts: string,
  rating?: string
) {
  await openQuickAction(page, 'Log a completion')
  await findLevel(page, level)

  await page.getByLabel('Attempts').fill(attempts)
  await page.getByRole('button', { name: 'Continue' }).click() // basics → rating

  if (rating != null) {
    // The stepper is a free-form text field that parses and commits on blur,
    // not per keystroke (components/generic/stepper-input.tsx), so a fill
    // alone leaves the draft holding the default. Enter blurs it; letting the
    // Continue click do the blurring would race its own step change.
    const field = page.getByLabel('Rating Score')
    await field.fill(rating)
    await field.press('Enter')
  }

  await page.getByRole('button', { name: 'Continue' }).click() // rating → session
  await page.getByRole('button', { name: 'Continue' }).click() // session → refs
  await page.getByRole('button', { name: 'Continue' }).click() // refs → review

  await expect(page.getByRole('heading', { name: 'Looks good?' })).toBeVisible()
  await page.getByRole('button', { name: 'Log completion' }).click()

  await expect(
    page.getByRole('heading', { name: `${level.name} logged` })
  ).toBeVisible()
}

/**
 * Walks the two-step progress wizard from an already-picked level to the write.
 *
 * The caller opens the flow and picks the level, because the two paths in
 * differ: the Log's FAB walks the find step, while a level page's own FAB
 * resolves the level it is already on and skips it.
 *
 * Only the run percentage is required — `ProgressStep` defaults the date to
 * today — and the second step is entirely optional fields, so nothing is
 * filled there. A spec that cares which fields were written should drive the
 * steps itself rather than call this; progress.e2e.ts owns that assertion, and
 * this exists for the specs that need a logged run as a fixture.
 *
 * The dialog closing is what says the POST resolved.
 */
export async function logRun(page: Page, run: string, date?: string) {
  await page.getByLabel('This run', { exact: true }).fill(run)
  if (date) await page.getByLabel('Date', { exact: true }).fill(date)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Log progress' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}
