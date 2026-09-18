// Where a `levels` row's metadata came from, as stored in `Level.dataSource`.
//
// Two of the four values mark rows RobTop's servers can never confirm, so the
// level sync must skip them: asking GD about one always looks like a not-found
// and would delist a row that is perfectly fine. See syncEligibleWhere.

/** A RobTop snapshot — the ordinary case. Written by robtopMapping.ts. */
export const DATA_SOURCE_ROBTOP = 'robtop_autofill'

/** Hand-entered through the manual-entry form, or a stub awaiting enrichment. */
export const DATA_SOURCE_MANUAL = 'manual'

/**
 * An official Geometry Dash level, seeded from `data/officialLevels.ts`.
 * getGJLevels21 does not serve these.
 */
export const DATA_SOURCE_OFFICIAL = 'official'

/**
 * A level that exists only for the end-to-end suite, seeded by
 * `pnpm db:seed:e2e` from `scripts/e2eFixtures.ts`.
 *
 * ⚠️ These rows must never exist in production. The seed script refuses to run
 * against it, and their ids sit above every real GD level id so one can never
 * collide with a level someone actually logs. This value is what makes them
 * identifiable — for the sync exclusions below, and for finding any that turn
 * up somewhere they shouldn't.
 */
export const DATA_SOURCE_E2E_FIXTURE = 'e2e_fixture'

/**
 * The data sources RobTop's servers cannot answer for, so the level sync leaves
 * them alone entirely.
 */
export const UNSYNCABLE_DATA_SOURCES = [
  DATA_SOURCE_OFFICIAL,
  DATA_SOURCE_E2E_FIXTURE,
] as const
