// Column widths for the Ranking page's numeric cells.
//
// The sticky header and the rows are separate elements that have to line up, so
// every width lives here rather than being written twice — the failure mode
// otherwise is a header that drifts a few pixels off its column and only shows
// up once a user has enough categories to notice.

/**
 * One category score. Wide enough for "10.0" on the 0–10 scale and "100" on the
 * 0–100 one, which are the longest values either can hold.
 */
export const SCORE_WIDTH = 'w-14'

/**
 * The overall rating. Wider than a category score: it is a weighted average, so
 * it carries up to three decimals where a raw score carries one.
 */
export const OVERALL_WIDTH = 'w-20'

/** The GDDL tier badge. */
export const TIER_WIDTH = 'w-9'

/** The edit button, and the header's spacer standing in for it. */
export const ACTION_WIDTH = 'w-7'

/**
 * The breakpoint category columns appear at.
 *
 * Below it a row keeps its overall rating alone: a user with six categories
 * would otherwise get six columns squeezed into a phone width, and the page's
 * job on a small screen is the order, not the breakdown.
 */
export const CATEGORY_COLUMNS_AT = 'hidden lg:flex'
