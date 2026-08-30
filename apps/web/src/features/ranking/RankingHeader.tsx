import {
  ACTION_WIDTH,
  CATEGORY_COLUMNS_AT,
  OVERALL_WIDTH,
  SCORE_WIDTH,
} from './columns'
import type { RatingCategory } from '@/lib/api/me'

/**
 * The sticky column header, shown in WEIGHTED mode where the rows carry a
 * per-category breakdown that would otherwise be unlabelled numbers.
 *
 * SIMPLE mode has one score and no header — a single column of ratings under a
 * heading reading "Rating" explains nothing the number does not.
 *
 * Categories appear in the user's own priority order, which is also the order
 * the ranking breaks ties in, so the leftmost column is the one that decides a
 * tie between two equal averages.
 *
 * The transparent border is load-bearing: every row draws a 1px border on all
 * four sides, which insets its content by 1px. Without a matching border box
 * here the header's columns sit exactly 1px right of the values beneath them —
 * small, but visible as a wobble down a column of numbers.
 */
export function RankingHeader({
  categories,
}: {
  categories: readonly RatingCategory[]
}) {
  return (
    <div className="sticky top-0 z-20 mb-2 flex h-8 items-center gap-3 border border-transparent border-b-border-subtle bg-bg-base px-2 text-[11px] font-medium text-text-secondary">
      <span className="min-w-0 flex-1">Level</span>
      {categories.map((category) => (
        <span
          key={category.id}
          className={`${CATEGORY_COLUMNS_AT} ${SCORE_WIDTH} shrink-0 justify-center truncate text-center`}
          title={category.name}
        >
          {category.name}
        </span>
      ))}
      <span className={`${OVERALL_WIDTH} shrink-0 text-center`}>Overall</span>
      <span className={`${ACTION_WIDTH} shrink-0`} aria-hidden />
    </div>
  )
}
