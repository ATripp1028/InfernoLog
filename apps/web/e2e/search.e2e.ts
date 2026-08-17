import type { Locator, Page, Response } from '@playwright/test'
import { expect, test } from './testBase'
import { CLUBSTEP, STEREO_MADNESS } from './fixtures/levels'

// The /search page's cache browse across the wire: GET /v1/levels/browse, and
// the keyset cursor it pages with.
//
// The cursor is the only reason this file is worth its runtime. It is an opaque
// token the server encodes from the last row's sort value plus its inGameId and
// decodes back into the next page's WHERE clause
// (services/levels/browse.ts) — so the client's whole contribution is to thread
// it back verbatim, and nothing on either side is typechecked against the
// other. Component specs stub lib/api/levelBrowse at the module boundary, so
// every one of them would still pass against a server that ignored the cursor
// and re-served page 1 forever. What that looks like in the product is a
// duplicated row halfway down an infinite scroll — invisible until someone
// scrolls, and invisible to the type system either way.
//
// Read-only, and the only spec in the suite that is: it writes nothing, owns no
// fixture level, and reads a table (`levels`) that is global rather than
// per-user. The reset does not clear that table, so what is in it is whatever
// every other user of the stage has already found — which means every assertion
// here has to be relational (no overlap between pages, ordering across the
// boundary, the cursor the client sent back). How many rows come back is not
// knowable and is never asserted, for the same reason this directory's README
// gives about counts of the user's own rows.
//
// Cache only, deliberately. GET /v1/levels/gd-search and POST /v1/levels both
// reach RobTop's servers, whose reachability is exactly what the official-level
// fixtures were chosen to keep out of this suite. Nothing here clicks the
// RobTop offer — and `forbiddenCalls` fails the test if a request reaches
// either endpoint anyway.

/** The subset of a browse row this spec reads. */
interface BrowseRow {
  inGameId: string
  name: string | null
  downloads: number | null
}

/** One page of GET /v1/levels/browse. */
interface BrowsePage {
  data: BrowseRow[]
  nextCursor: string | null
}

// Every level `pnpm db:seed:official` writes carries this creator verbatim, and
// there are more of them than a page holds (38 against browse.ts's PAGE_SIZE of
// 30). So a creator search for it is the one query on a shared stage that
// overflows into a second page without depending on what anyone else has
// cached. Read off a fixture level so the two spellings cannot drift.
const OFFICIAL_CREATOR = STEREO_MADNESS.creator

// Requests to the two endpoints that would take this spec to RobTop's servers,
// collected per test and asserted empty afterwards. Safe as module state: the
// suite is `workers: 1` and not `fullyParallel`, so one test's page is the only
// one alive.
let forbiddenCalls: string[] = []

test.beforeEach(({ page }) => {
  forbiddenCalls = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    const isGdSearch = pathname.endsWith('/v1/levels/gd-search')
    const isSeed =
      request.method() === 'POST' && pathname.endsWith('/v1/levels')
    if (isGdSearch || isSeed) {
      forbiddenCalls.push(`${request.method()} ${pathname}`)
    }
  })
})

test.afterEach(() => {
  expect(
    forbiddenCalls,
    'this spec must stay inside the cache — these endpoints call RobTop'
  ).toEqual([])
})

/**
 * Matches a browse response, either the first page (no cursor) or a later one.
 *
 * The presence of the `cursor` param is what tells the two apart, and is itself
 * half of what the pagination assertions are about: a first request that
 * carried one, or a second that did not, is the failure this spec exists for.
 */
function browseResponse(paged: boolean) {
  return (response: Response) => {
    const url = new URL(response.url())
    return (
      url.pathname.endsWith('/v1/levels/browse') &&
      url.searchParams.has('cursor') === paged
    )
  }
}

/**
 * The rendered result rows, in DOM order.
 *
 * Located by their link target rather than their text: SearchGridRow's
 * accessible name is the level's name, creator, id, difficulty and stats run
 * together, while the href is `/levels/<inGameId>` and nothing else on the page
 * links there. Scoped to `main` so the mobile nav's own links cannot join in.
 */
function resultRows(page: Page): Locator {
  return page.getByRole('main').locator('a[href^="/levels/"]')
}

/**
 * Indexes into a page's rows, with the emptiness case turned into a readable
 * failure rather than a `possibly undefined` (noUncheckedIndexedAccess).
 */
function row(rows: BrowseRow[], index: number): BrowseRow {
  const found = rows.at(index)
  if (!found) throw new Error(`no browse row at index ${index}`)
  return found
}

/**
 * Deep-links a search, then scrolls until the grid asks for the second page.
 *
 * Deep-linking rather than typing into the bar: the URL is the /search page's
 * own state (the route's validateSearch), and the request under test is built
 * from it by browseApiQueryString either way — so committing the search through
 * the bar would only add its debounce to the runtime. The scroll is what drives
 * pagination at all: SearchResultsGrid pages on an IntersectionObserver
 * sentinel, so the last rendered row has to come into view before the client
 * ever sends the cursor back.
 *
 * Returns both pages as the server answered them, plus the rows locator.
 */
async function browsePastTheFirstPage(page: Page, search: string) {
  const firstRequest = page.waitForResponse(browseResponse(false))
  await page.goto(`/search?${search}`)

  const firstResponse = await firstRequest
  expect(firstResponse.status()).toBe(200)
  const first = (await firstResponse.json()) as BrowsePage
  expect(
    first.nextCursor,
    `no second page for "${search}" — the levels cache holds less than a full page of ${OFFICIAL_CREATOR} levels. Run \`pnpm db:seed:official\` against this stage.`
  ).not.toBeNull()

  // Every row the server sent is on screen before anything is scrolled, so the
  // append assertion below is about the second page rather than about the
  // first one having finished rendering.
  const rows = resultRows(page)
  await expect(rows).toHaveCount(first.data.length)

  const secondRequest = page.waitForResponse(browseResponse(true))
  await rows.last().scrollIntoViewIfNeeded()
  const secondResponse = await secondRequest

  // The cursor, threaded back exactly as it was handed over. An encode/decode
  // that lost a field, or a client that re-sent the request without one, both
  // land here.
  expect(new URL(secondResponse.url()).searchParams.get('cursor')).toBe(
    first.nextCursor
  )
  expect(secondResponse.status()).toBe(200)
  const second = (await secondResponse.json()) as BrowsePage
  expect(second.data.length).toBeGreaterThan(0)

  return { first, second, rows }
}

/**
 * Asserts the two pages are disjoint.
 *
 * The keyset's whole job. A cursor comparison that used `<=` where it meant
 * `<`, or one the server quietly dropped, repeats rows across the boundary —
 * and since the grid keys on inGameId, the duplicate renders as a row that
 * simply appears twice.
 */
function expectNoOverlap(first: BrowsePage, second: BrowsePage) {
  const firstIds = first.data.map((r) => r.inGameId)
  const repeated = second.data
    .map((r) => r.inGameId)
    .filter((id) => firstIds.includes(id))
  expect(repeated, 'the second page repeats rows from the first').toEqual([])
}

test.describe('search / browse', () => {
  test('pages the cache with the keyset cursor, breaking ties by level id', async ({
    page,
  }) => {
    // Sorted by downloads, which official levels do not have: the seed never
    // writes the column (they are not online levels), so browse.ts's
    // COALESCE("downloads", -1) collapses all 38 of them to the same sort
    // value. That makes this the tie case — the page boundary falls inside one
    // run of equal values, so the second page can only be found through the
    // keyset's `(value = cursor.value AND "inGameId" > cursor.id)` arm. A
    // cursor that compared on the sort value alone returns an empty second page
    // here, and one that compared inclusively returns the first page again.
    const { first, second, rows } = await browsePastTheFirstPage(
      page,
      `query=${OFFICIAL_CREATOR}&searchBy=creator&sort=downloads&sortDir=desc`
    )

    // The creator search matched the official set at all — asserted against a
    // named level rather than a count, so nothing else in the cache can move
    // it. Without this, a filter that silently matched everything would still
    // satisfy every assertion below.
    const ids = [...first.data, ...second.data].map((r) => r.inGameId)
    expect(ids).toContain(CLUBSTEP.inGameId)

    expectNoOverlap(first, second)

    // The boundary is inside the tie run, which is what makes this spec a test
    // of the tiebreak rather than of the ordinary case.
    expect(
      row(first.data, -1).downloads,
      'the page boundary no longer falls inside a run of equal sort values, so the keyset tiebreak is not being exercised'
    ).toBe(row(second.data, 0).downloads)

    // Ordering, read across the two pages as one sequence: descending by sort
    // value, ascending by inGameId wherever the value repeats. Both sides
    // compare the same way here — the ids are digit strings, which Postgres and
    // JS order identically whatever the database's collation is.
    const sequence = [...first.data, ...second.data]
    for (let i = 1; i < sequence.length; i++) {
      const previous = sequence[i - 1]
      const current = sequence[i]
      // Unreachable; noUncheckedIndexedAccess wants it said out loud.
      if (!previous || !current) continue
      // The sort expression's own COALESCE, mirrored: a null download count
      // sorts as -1 rather than dropping out of the ordering.
      const previousValue = previous.downloads ?? -1
      const currentValue = current.downloads ?? -1
      if (previousValue === currentValue) {
        expect(
          current.inGameId > previous.inGameId,
          `tied rows must break by ascending id, got ${previous.inGameId} then ${current.inGameId}`
        ).toBe(true)
      } else {
        expect(previousValue).toBeGreaterThan(currentValue)
      }
    }

    // The grid appended the second page to the first rather than replacing it,
    // in the order the server returned. A prefix comparison, not an equality:
    // scrolling the last row into view can carry the sentinel far enough to ask
    // for a third page, and how many pages the cache holds is not this spec's
    // business.
    const hrefs = await Promise.all(
      (await rows.all()).map((r) => r.getAttribute('href'))
    )
    const expected = ids.map((id) => `/levels/${id}`)
    expect(hrefs.length).toBeGreaterThanOrEqual(expected.length)
    expect(hrefs.slice(0, expected.length)).toEqual(expected)
  })

  test('pages a text-valued sort with the same cursor', async ({ page }) => {
    // The other half of the cursor's encoding. A name sort orders on
    // LOWER(name), so the token carries a string where the sort above put a
    // number, and browse.ts binds it into the next page's WHERE through its own
    // branch. Lose that branch and the numeric one runs `Number("clubstep")`,
    // which is NaN, and a NaN comparison matches nothing at all — the second
    // page comes back empty rather than wrong, which is why it is asserted
    // separately from the numeric sort above.
    const { first, second } = await browsePastTheFirstPage(
      page,
      `query=${OFFICIAL_CREATOR}&searchBy=creator&sort=name&sortDir=asc`
    )

    // A text cursor that broke comes back as an empty second page or a repeat
    // of the first, and the helper has already ruled the first out. This rules
    // out the second.
    expectNoOverlap(first, second)

    // Deliberately no assertion that the names themselves are in order.
    // Postgres orders them under the database's collation while JS compares
    // UTF-16 code units, and the two disagree about spaces — "The Seven Seas"
    // and "Theory of Everything" swap places between them. Ordering is the
    // other test's assertion, on ids, where the two agree.
  })
})
