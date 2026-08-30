import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  ACTION_WIDTH,
  CATEGORY_COLUMNS_AT,
  OVERALL_WIDTH,
  SCORE_WIDTH,
} from './columns'
import { OVERALL_SORT, type RankingSort } from './rankingModel'
import type { RatingCategory } from '@/lib/api/me'

interface RankingHeaderProps {
  categories: readonly RatingCategory[]
  sort: RankingSort
  onSort: (key: string) => void
}

/**
 * The sticky column header, shown in WEIGHTED mode where the rows carry a
 * per-category breakdown that would otherwise be unlabelled numbers.
 *
 * SIMPLE mode has one score and no header — a single column of ratings under a
 * heading reading "Rating" explains nothing the number does not, and with one
 * column there is nothing to sort by that the page is not already sorted by.
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
  sort,
  onSort,
}: RankingHeaderProps) {
  return (
    <div className="sticky top-0 z-20 mb-2 flex h-8 items-center gap-3 border border-transparent border-b-border-subtle bg-bg-base px-2 text-[11px] font-medium text-text-secondary">
      <span className="min-w-0 flex-1">Level</span>
      {categories.map((category) => (
        <SortButton
          key={category.id}
          label={category.name}
          sortKey={category.id}
          sort={sort}
          onSort={onSort}
          className={`${CATEGORY_COLUMNS_AT} ${SCORE_WIDTH}`}
        />
      ))}
      <SortButton
        label="Overall"
        sortKey={OVERALL_SORT}
        sort={sort}
        onSort={onSort}
        className={`flex ${OVERALL_WIDTH}`}
      />
      <span className={`${ACTION_WIDTH} shrink-0`} aria-hidden />
    </div>
  )
}

/**
 * One sortable column heading.
 *
 * The arrow is positioned absolutely rather than sitting beside the label,
 * because the label has to stay centred on the column: the values below it are
 * centred too, and a label that shuffles sideways when a column becomes active
 * reads as the header drifting out of alignment.
 */
function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: string
  sort: RankingSort
  onSort: (key: string) => void
  className: string
}) {
  const active = sort.key === sortKey
  const Arrow = sort.dir === 'desc' ? ChevronDown : ChevronUp

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
      aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
      className={`${className} relative shrink-0 items-center justify-center truncate text-center transition-colors hover:text-text-primary ${
        active ? 'text-text-primary' : ''
      }`}
    >
      {label}
      {active && (
        <Arrow
          size={12}
          aria-hidden
          className="absolute right-0 top-1/2 -translate-y-1/2"
        />
      )}
    </button>
  )
}
