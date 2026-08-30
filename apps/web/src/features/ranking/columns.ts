// Column widths for the Ranking page's numeric cells.
//
// The sticky header and the rows are separate elements that have to line up, so
// every width lives here rather than being written twice — the failure mode
// otherwise is a header that drifts a few pixels off its column and only shows
// up once a user has enough categories to notice.

/**
 * One category score.
 *
 * Sized by the sticky header's label rather than by the value: the widest
 * default category name ("Decoration") needs ~58px at 11px type, plus clearance
 * for the sort arrow that sits at the column's right edge when it is the active
 * sort. A column narrower than its own heading clips the heading and reads as
 * misaligned. Values are far shorter — "10.0" is the longest either scale
 * holds. A much longer custom name still truncates, with the full name on hover.
 */
export const SCORE_WIDTH = 'w-20'

/**
 * The overall rating. Wider than a category score at desktop widths, since a
 * weighted average carries up to three decimals where a raw score carries one —
 * but narrower on a phone, where those pixels are the level's name instead and
 * a value that long is rare enough to wrap the column rather than the row.
 */
export const OVERALL_WIDTH = 'w-16 lg:w-20'

/**
 * The difficulty face's box.
 *
 * `DifficultyFace` sizes a square that the glow fills and the face sits inset
 * within, so the number is mostly padding around a smaller icon. Kept tight
 * here because this row's job is a name and a number, and on a phone every
 * pixel the face takes is a pixel the level's name does not get.
 */
export const FACE_SIZE = 56

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
