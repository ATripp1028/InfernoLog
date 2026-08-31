import type { Page } from '@playwright/test'
import { expect, test } from './testBase'
import { coldReload, logCompletion } from './flows'
import { MACHINA, POLARGEIST, type FixtureLevel } from './fixtures/levels'

// The Ranking page, which is ordered by the rating each completion was logged
// with rather than arranged by hand.
//
// Two things here cross the wire and nothing else in the repo would notice
// them breaking. The rating is one: it is typed into the logging wizard in
// display units, stored as an integer 0–100, and comes back as a
// server-computed `overallRating` that this page both prints and sorts on — a
// round trip no type relates end to end, and one the page never recomputes for
// itself. The level's difficulty is the other: `filterByDifficulty` matches on
// `level.inGameDifficulty` exactly as the API sends it, so a column that
// arrived null would leave the filter matching nothing while looking perfectly
// healthy.
//
// Everything else on this page is pure model with its own unit specs —
// sorting, renumbering, the difficulty toggle's exclusivity rules
// (features/ranking/tests/). Those build their rows from fixtures, so all of
// them keep passing against a server that stopped sending either field.

// Mobile viewport, for the reason completion.e2e.ts gives: `logCompletion`
// drives the FAB, which is a real button only below `md`. The Ranking page
// itself renders the same controls at both breakpoints.
test.use({ viewport: { width: 390, height: 844 } })

// Display units — the reset leaves the user on the 0–10 scale in SIMPLE mode.
// Deliberately at opposite ends and deliberately not round: the page trims
// trailing zeros (`formatRating`), so "2.0" would render as "2" and match the
// "#2" in the row's own position, and a rating assertion that can be satisfied
// by a rank number is not a rating assertion.
const TOP_RATING = '9.5'
const LOW_RATING = '1.5'

/**
 * A level's whole row, by the DOM id `useRankingPage.rowDomId` gives it.
 *
 * The row's ranked name sits inside a link and its rating sits outside one, so
 * an accessible-name locator can reach either but never both — and it is the
 * two together that this spec is about. The id is the only handle that spans
 * them.
 */
function row(page: Page, level: FixtureLevel) {
  return page.locator(`#rank-${level.inGameId}`)
}

/** A ranked row at a specific position, which renders as `#<n> — <name>`. */
function rankedRow(page: Page, rank: number, level: FixtureLevel) {
  return page.getByText(`#${rank} — ${level.name}`)
}

/**
 * Every ranked row's level id, in the order they are rendered.
 *
 * Read as a list rather than asserted position by position, because a position
 * in the *whole* ranking is a claim about what every earlier spec left behind:
 * the wizard defaults a rating to the middle of the scale, so each of their
 * completions is sitting in this list at 5. The order two rows hold relative to
 * each other is not — it follows from their ratings alone.
 */
async function rankedLevelIds(page: Page): Promise<string[]> {
  return page
    .locator('[id^="rank-"]')
    .evaluateAll((rows) => rows.map((r) => r.id.slice('rank-'.length)))
}

/** Switches the row numbers to count the filtered view rather than the ranking. */
async function numberInView(page: Page) {
  const toggle = page
    .locator('label', { hasText: 'Number in view' })
    .getByRole('switch')
  await toggle.click()
  await expect(toggle).toBeChecked()
}

/**
 * Filters by one of the non-demon difficulties, which live in the strip's
 * collapsed drawer (this is a demon tracker; the five demon difficulties are
 * the ones on show).
 *
 * The drawer is held open by two independent inputs — the chevron pins it, the
 * pointer hovers it — so closing it takes both, and it has to be closed:
 * it drops *over* the top of the ranked list, and the rows this spec reads
 * next are the ones underneath it.
 */
async function filterByNonDemonDifficulty(page: Page, difficulty: string) {
  const drawer = page.getByRole('button', {
    name: 'Show non-demon difficulties',
  })
  const button = page.getByRole('button', { name: difficulty, exact: true })

  await drawer.click()
  await button.click()
  await drawer.click()
  await page.mouse.move(0, 0)
  await expect(button).toBeHidden()
}

test.describe('ranking', () => {
  test('ranks a completion by the rating it was logged with', async ({
    page,
  }) => {
    await page.goto('/log')

    await logCompletion(page, POLARGEIST, '212', TOP_RATING)
    await page.getByRole('button', { name: 'Place later' }).click()

    await logCompletion(page, MACHINA, '46', LOW_RATING)
    await page.getByRole('button', { name: 'Place later' }).click()

    // Cold, because the ranking is a second view over the Log's `['log']`
    // query and that query is persisted to localStorage. A bare reload inside
    // the `staleTime` window would re-read what the two writes above already
    // put in the cache, and pass against a server that stored no rating at all.
    await page.goto('/ranking')
    await coldReload(page)

    // The rating first: this is the number typed into the wizard, rounded into
    // the internal 0–100 integer on the way in and computed back into an
    // overall on the way out.
    await expect(row(page, POLARGEIST)).toContainText(TOP_RATING)
    await expect(row(page, MACHINA)).toContainText(LOW_RATING)

    // Then the order it earned. Both rows are known to exist by now, so an
    // index of -1 cannot sneak past this comparison.
    const order = await rankedLevelIds(page)
    expect(order.indexOf(POLARGEIST.inGameId)).toBeLessThan(
      order.indexOf(MACHINA.inGameId)
    )

    // Exact positions need a view whose population this spec owns, which is
    // what the difficulty filter buys: these two are the only completed Normal
    // levels in the suite (fixtures/levels.ts), and "Number in view"
    // renumbers what is on screen 1..n instead of quoting each row's place in
    // a ranking that carries every other spec's leftovers.
    await numberInView(page)
    await filterByNonDemonDifficulty(page, 'Normal')

    await expect(rankedRow(page, 1, POLARGEIST)).toBeVisible()
    await expect(rankedRow(page, 2, MACHINA)).toBeVisible()

    // And the filter in the other direction, on the same two rows rather than
    // on a count: a difficulty neither level has takes both of them away. The
    // selection is a union, so it is cleared first — picking a second
    // difficulty would widen the view instead of moving it.
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.getByRole('button', { name: 'Easy Demon', exact: true }).click()

    await expect(row(page, POLARGEIST)).toBeHidden()
    await expect(row(page, MACHINA)).toBeHidden()
  })
})
