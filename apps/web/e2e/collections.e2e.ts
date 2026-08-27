import type { Page } from '@playwright/test'
import { expect, test } from './testBase'
import { levelResultRow, logCompletion, openQuickAction } from './flows'
import {
  FINGERDASH,
  STEREO_MADNESS,
  type FixtureLevel,
} from './fixtures/levels'

// Collections across the wire: a custom collection's whole lifecycle (create →
// add a level → remove it), and the Want to Beat handoff.
//
// The handoff is the reason this file is worth its runtime. "Want to Beat holds
// only unbeaten levels" is enforced at the application layer, inside the
// completion's own transaction (removeFromWantToBeat, called from
// services/progress) — so the frontend never asks for it and never sees it in a
// mocked response. Every component spec would still pass if the server stopped
// doing it.
//
// As in completion.e2e.ts, the assertions land after a reload or a fresh
// navigation: what is under test is the server's view of what was written, not
// the post-mutation cache.

// Mobile viewport, for the reason completion.e2e.ts gives: every affordance
// these flows need is a plain button below `md`. On desktop the FAB's secondary
// actions exist only while the speed dial is hovered, and the entry rows are
// dnd-kit sortables.
test.use({ viewport: { width: 390, height: 844 } })

// The collection the first spec creates. A fixed name is safe: the reset drops
// every custom collection before a run and again before a retry, so it cannot
// collide with a leftover and trip the create dialog's duplicate-name check. It
// must also stay clear of RESERVED_COLLECTION_NAMES, which that dialog rejects
// client-side.
const COLLECTION_NAME = 'E2E Practice Set'

/**
 * A level's row on a collection detail page, located by its remove button —
 * the one element in the row whose accessible name carries the level's.
 */
function entryRow(page: Page, level: FixtureLevel) {
  return page.getByRole('button', {
    name: `Remove ${level.name} from collection`,
  })
}

/**
 * Opens a collection from the index by name.
 *
 * Matches the card link on a prefix because its accessible name also carries
 * the entry count ("Want to Beat Built-in 1 level"), and a count is the one
 * thing a spec here must not pin — see this directory's README.
 *
 * Navigating from the index rather than deep-linking is also how the built-in
 * collections' ids are discovered at all: they are per-user UUIDs the suite has
 * no other way to know.
 */
async function openCollection(page: Page, name: string) {
  await page.goto('/collections')
  await page.getByRole('link', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

/**
 * Picks a level by name in AddLevelsDialog, whichever surface opened it.
 *
 * Name search, not the ID field, for the reason logCompletion gives: the
 * fixture levels are official, so their ids are one and two digits, below the
 * four the dialog needs before it treats a typed number as a level id.
 *
 * The field is located here rather than in flows.ts even though the logging
 * flow's find step carries an identical label: `Level ID or name` is written
 * out separately in AddLevelsDialog, AddToCollectionDialog and FindLevelStep,
 * so a shared helper would let a relabelling in one break specs driving
 * another. The result row is the opposite case — one shared component — hence
 * the import.
 *
 * The dialog closing is what says the POST resolved — "Add another after this"
 * is off by default, so a successful add is the only thing that closes it.
 */
async function addLevel(page: Page, level: FixtureLevel) {
  await page.getByLabel('Level ID or name').fill(level.name)
  await levelResultRow(page, level).click()
  await expect(page.getByLabel('Level ID or name')).toBeHidden()
}

test.describe('collections', () => {
  test('creates a custom collection, adds a level, and removes it', async ({
    page,
  }) => {
    await page.goto('/collections')

    // Scoped to the customs section: the mobile FAB is labelled with its
    // primary action, which on this page is "New collection" too.
    await page
      .getByRole('region', { name: 'Your collections' })
      .getByRole('button', { name: 'New collection' })
      .click()
    await page.getByLabel('Name', { exact: true }).fill(COLLECTION_NAME)
    await page.getByRole('button', { name: 'Create collection' }).click()
    // Wait for the dialog to close, which happens only once the POST resolves.
    // Navigating while it is still in flight would abort the request.
    await expect(page.getByLabel('Name', { exact: true })).toBeHidden()

    // Reached from the index, so finding the card is itself the check that the
    // collection came back from the server rather than only from the cache.
    await openCollection(page, COLLECTION_NAME)

    // The empty state's own button, not the FAB: a custom collection's FAB has
    // secondary actions (Edit / Delete), so tapping it opens the sheet instead
    // of the dialog. Scoped to `main` because the FAB carries the same label —
    // it sits inside `main`, but is display:none below `md`, while the mobile
    // nav that replaces it renders outside.
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Add levels' })
      .click()
    await addLevel(page, STEREO_MADNESS)

    await page.reload()
    await expect(entryRow(page, STEREO_MADNESS)).toBeVisible()

    // Removal is optimistic (useRemoveCollectionEntry rolls back onError), so
    // the row vanishing proves nothing on its own — and the query cache is
    // persisted to localStorage, so it survives the reload below. Waiting on
    // the DELETE is what makes this an assertion about the server.
    const removed = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        /\/v1\/me\/collections\/[^/]+\/entries\//.test(r.url())
    )
    await entryRow(page, STEREO_MADNESS).click()
    expect((await removed).status()).toBe(200)

    await page.reload()
    await expect(entryRow(page, STEREO_MADNESS)).toBeHidden()
  })

  test('drops a level from Want to Beat when its completion is logged', async ({
    page,
  }) => {
    // /log keeps the default FAB actions, so Want to Beat is one tap away.
    await page.goto('/log')
    await openQuickAction(page, 'Add to Want to Beat')
    await addLevel(page, FINGERDASH)

    // Assert it landed before completing it. Without this the spec could pass
    // on an add that silently failed — the closing assertion is an absence, and
    // an absence is true of a level that was never there.
    await openCollection(page, 'Want to Beat')
    await expect(entryRow(page, FINGERDASH)).toBeVisible()

    await page.goto('/log')
    await logCompletion(page, FINGERDASH, '203')
    await page.getByRole('button', { name: 'Place later' }).click()

    // Nothing in the client removed this row — the completion's transaction
    // did, and the frontend only invalidated ['collections'] afterwards. So
    // this is the server's answer, re-fetched on a fresh navigation.
    await openCollection(page, 'Want to Beat')
    await expect(entryRow(page, FINGERDASH)).toBeHidden()
  })
})
