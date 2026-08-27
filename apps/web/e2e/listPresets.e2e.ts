import type { Locator, Page } from '@playwright/test'
import { expect, test } from './testBase'
import { findLevel, levelCard, logRun, openQuickAction } from './flows'
import { POWER_TRIP, VIKING_ARENA } from './fixtures/levels'

// Saved List views across the wire: POST / PATCH / DELETE
// /v1/me/log-presets, and the view a stored preset drives once it is read
// back.
//
// What makes this worth its runtime is the shape, not the CRUD. A preset's
// four view fields (`sorts`, `filters`, `columns`, `columnOrder`) are
// `z.unknown()` in LogPresetInputSchema and `Json` columns in Prisma — the
// API stores and returns them verbatim without ever looking inside. So the
// only agreement about what a filter *is* holds between
// features/log/types.ts, which writes it, and features/log/presets.ts,
// which reads it back — with a database round trip in between that nothing
// type-checks. Component specs stub lib/api/presets.ts at the module
// boundary and would pass against a server that stored `{}`.
//
// Two things inside that blob are pinned on the create response specifically:
// `filters.statuses`, which carries the internal enum (`IN_PROGRESS`) rather
// than the chip's label, and `filters.dateBeaten`, whose `{ from: null, to:
// null }` is the JSON-null case a Prisma `Json` column can quietly turn into
// a database NULL. Neither shows up as an error when it drifts — a preset
// just stops filtering.

// Mobile viewport, for the reason completion.e2e.ts gives: every affordance
// these flows need is a plain button below `md`. The preset surfaces are
// genuinely two components — PresetSelector's popover on desktop, PresetSheet
// on mobile — but they render the same PresetRow and call the same handlers,
// and it is the wire this suite is here for, not the picker.
test.use({ viewport: { width: 390, height: 844 } })

// The presets each spec creates. Fixed names are safe: the reset drops every
// listPreset before a run and again before a retry, so they cannot collide
// with a leftover and trip PresetCreateDialog's duplicate-name check.
const VIEW_PRESET = 'E2E Unbeaten'
const META_PRESET = 'E2E Scratch'
const META_PRESET_RENAMED = 'E2E Scratch (renamed)'

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
 * `staleTime`, and every preset mutation writes the result straight into the
 * cache with `setQueryData` rather than invalidating — so a spec that saves a
 * preset and reloads inside the same minute is re-reading what it just wrote,
 * and would pass against a server that persisted nothing at all. Clearing the
 * one key forces the GET.
 *
 * Amplify's session lives under its own `CognitoIdentityServiceProvider.*`
 * keys, so this does not sign the page out.
 */
async function coldReload(page: Page) {
  await page.evaluate((key) => localStorage.removeItem(key), QUERY_CACHE_KEY)
  await page.reload()
}

/**
 * Toggles Progress-status filter chips, then closes the filter panel.
 *
 * Closing is not tidiness. Below `md` the panel is a Radix modal, which
 * `aria-hidden`s the rest of the page — so every `getByRole` behind it stops
 * matching, and a `toBeHidden()` on a level card would pass while the card is
 * sitting right there. Assertions have to come after this returns.
 *
 * Chips are exact-matched: the section header is a button named "Progress",
 * which the default substring match would find alongside "In Progress".
 */
async function toggleProgressFilters(page: Page, labels: string[]) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Filters' })
  for (const label of labels) {
    await panel.getByRole('button', { name: label, exact: true }).click()
  }
  await panel.getByRole('button', { name: 'Close filters' }).click()
  await expect(panel).toBeHidden()
}

/**
 * The mobile preset sheet — a `role="menu"` (MobileActionSheet) rather than a
 * dialog, so the list behind it stays readable while it is open.
 */
function presetMenu(page: Page): Locator {
  return page.getByRole('menu', { name: 'Presets' })
}

/**
 * Opens the preset sheet.
 *
 * The trigger carries the active preset's name ("Preset · Default"), so it is
 * matched on the prefix — the toolbar's other two buttons in that row ("Save",
 * "Reset") appear only once the view has drifted.
 */
async function openPresetMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Preset/ }).click()
  const menu = presetMenu(page)
  await expect(menu).toBeVisible()
  return menu
}

/**
 * A preset's row in the sheet, located by its name text.
 *
 * Not `getByRole('button', { name })`: PresetRow nests two `role="button"`
 * spans labelled "Edit <name>" and "Delete <name>" inside the row button, so
 * the row's own accessible name is all three concatenated and a name match
 * resolves to three elements. The name span is the one unambiguous handle, and
 * clicking it clicks the row. Exact, so the pending-delete row's `Delete
 * "<name>"?` cannot match it either.
 */
function presetOption(menu: Locator, name: string): Locator {
  return menu.getByText(name, { exact: true })
}

/**
 * Picks a preset from the sheet. The sheet closes itself on select.
 */
async function selectPreset(page: Page, name: string) {
  const menu = await openPresetMenu(page)
  await presetOption(menu, name).click()
  await expect(menu).toBeHidden()
}

/**
 * Saves the current view as a new preset, and returns the create response.
 *
 * The name field is reached by placeholder: PresetCreateDialog's `<label>` is
 * a sibling of the input rather than wrapping it or carrying `htmlFor`, so
 * `getByLabel('Name')` finds nothing. The toolbar's own "Save" is exact-matched
 * because the dialog's submit ("Save preset") contains it.
 */
async function savePresetAs(page: Page, name: string) {
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && r.url().endsWith('/v1/me/log-presets')
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByPlaceholder('My preset').fill(name)
  await page.getByRole('button', { name: 'Save preset' }).click()
  return created
}

test.describe('list presets', () => {
  test('saves the current view as a preset and re-applies it after a reload', async ({
    page,
  }) => {
    await page.goto('/log')

    // Two rows the status filter can tell apart, logged here rather than
    // assumed: the reset leaves no progress at all, and no other spec touches
    // these two levels. Both write paths are progress.e2e.ts's subject — here
    // they are only fixtures, so nothing beyond the status they leave behind
    // is filled in or asserted.
    await openQuickAction(page, 'Log progress')
    await findLevel(page, VIKING_ARENA)
    const runLogged = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().endsWith('/v1/me/progress')
    )
    // No date: only the run percentage is required, and ProgressStep defaults
    // the date to today (types.ts's `todayDateInput`).
    await logRun(page, '47')
    expect((await runLogged).status()).toBe(201)

    await openQuickAction(page, 'Drop a level')
    await findLevel(page, POWER_TRIP)
    const dropped = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/v1/me/drops')
    )
    await page.getByRole('button', { name: 'Drop level' }).click()
    expect((await dropped).status()).toBe(201)
    await expect(page.getByRole('dialog')).toBeHidden()

    // The default view holds both — the baseline every later assertion is
    // read against.
    await expect(levelCard(page, VIKING_ARENA)).toBeVisible()
    await expect(levelCard(page, POWER_TRIP)).toBeVisible()

    await toggleProgressFilters(page, ['In Progress'])
    await expect(levelCard(page, VIKING_ARENA)).toBeVisible()
    await expect(levelCard(page, POWER_TRIP)).toBeHidden()

    const created = await savePresetAs(page, VIEW_PRESET)
    expect(created.status()).toBe(201)

    // The stored blob, as the server read it back out of the Json column —
    // the one place the filter shape is visible on the wire. `statuses` is
    // the internal enum the chip's label is not, and `dateBeaten` is the
    // all-null object a Json column can turn into a bare NULL.
    const { data } = (await created.json()) as {
      data: {
        filters: { statuses: string[]; dateBeaten: unknown }
        sorts: { key: string; dir: string }[]
        hideTime: boolean
      }
    }
    expect(data.filters.statuses).toEqual(['IN_PROGRESS'])
    expect(data.filters.dateBeaten).toEqual({ from: null, to: null })
    expect(data.sorts).toEqual([{ key: 'date', dir: 'desc' }])
    // A real boolean column rather than part of a blob, so it is the control
    // for the three assertions above.
    expect(data.hideTime).toBe(false)

    // Saving a preset does not record it as the selected one (only
    // handleSelectPreset writes the cookie), so a cold boot comes up on the
    // built-in default. Asserting that first is what makes the re-apply below
    // an assertion about the preset rather than about a filter that was never
    // cleared.
    await coldReload(page)
    await expect(levelCard(page, VIKING_ARENA)).toBeVisible()
    await expect(levelCard(page, POWER_TRIP)).toBeVisible()

    // Re-applied from the picker. Nothing in this page load has seen the
    // filter before: it came back from GET /v1/me/log-presets and drove the
    // view through cleanupPresetForCategories → applyPresetConfig.
    await selectPreset(page, VIEW_PRESET)
    await expect(levelCard(page, VIKING_ARENA)).toBeVisible()
    await expect(levelCard(page, POWER_TRIP)).toBeHidden()

    // Overwrite is the same four blobs on a different verb, written by a
    // different Prisma call (a conditional `update` rather than a `create`),
    // so the round trip above says nothing about it. Inverting the filter
    // makes the two assertions swap places, which a PATCH that dropped the
    // body could not fake.
    await toggleProgressFilters(page, ['In Progress', 'Dropped'])
    const overwritten = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/v1/me/log-presets/')
    )
    const menu = await openPresetMenu(page)
    await menu
      .getByRole('button', { name: `Overwrite "${VIEW_PRESET}"` })
      .click()
    expect((await overwritten).status()).toBe(200)

    // Selecting the preset above wrote the cookie, so this boot restores it
    // on its own. The trigger label is asserted first so a failure to restore
    // reads as that rather than as a filter that did not apply.
    await coldReload(page)
    await expect(page.getByRole('button', { name: /^Preset/ })).toContainText(
      VIEW_PRESET
    )
    await expect(levelCard(page, POWER_TRIP)).toBeVisible()
    await expect(levelCard(page, VIKING_ARENA)).toBeHidden()
  })

  test('renames a saved preset and deletes it', async ({ page }) => {
    await page.goto('/log')

    // No levels logged on purpose. The filter chips exist whether or not the
    // user has rows for them to act on, and everything asserted here is the
    // preset itself — so this spec adds a rename and a delete without paying
    // for a second round of logging flows.
    await toggleProgressFilters(page, ['Completed'])
    expect((await savePresetAs(page, META_PRESET)).status()).toBe(201)

    // The other arm of PATCH: name/description/colour only, with the four view
    // blobs absent from the body. LogPresetUpdateSchema is
    // `LogPresetInputSchema.partial()` and the route spreads each field in
    // only when it is not undefined, so a regression here writes an empty
    // view over a good one rather than failing.
    const renamed = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/v1/me/log-presets/')
    )
    const menu = presetMenu(page)
    await openPresetMenu(page)
    await menu
      .getByRole('button', { name: `Edit ${META_PRESET}`, exact: true })
      .click()
    await page.getByPlaceholder('My preset').fill(META_PRESET_RENAMED)
    await page.getByRole('button', { name: 'Save changes' }).click()
    expect((await renamed).status()).toBe(200)

    await coldReload(page)
    await openPresetMenu(page)
    await expect(presetOption(menu, META_PRESET_RENAMED)).toBeVisible()
    await expect(presetOption(menu, META_PRESET)).toBeHidden()

    // Delete is two taps: the row's trash icon swaps the row for an inline
    // confirm, whose own button is named just "Delete" — exact-matched so it
    // cannot resolve to the `Delete <name>` icon it replaced.
    const deleted = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        r.url().includes('/v1/me/log-presets/')
    )
    await menu
      .getByRole('button', {
        name: `Delete ${META_PRESET_RENAMED}`,
        exact: true,
      })
      .click()
    await menu.getByRole('button', { name: 'Delete', exact: true }).click()
    expect((await deleted).status()).toBe(204)

    // Gone from the server's list, not just from the cache the mutation
    // rewrote. Default is asserted alongside it because an empty sheet would
    // satisfy the absence on its own.
    await coldReload(page)
    await openPresetMenu(page)
    await expect(presetOption(menu, META_PRESET_RENAMED)).toBeHidden()
    await expect(presetOption(menu, 'Default')).toBeVisible()
  })
})
