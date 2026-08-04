import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '@/pages/SearchPage'
import {
  validateSearchState,
  type SearchPageState,
} from '@/lib/levelSearchParams'

// The /search URL is the source of truth for the results grid: `query`, the
// `searchBy` mode, every filter, and the sort all live in the search params so a
// result set is shareable and survives refresh/back. validateSearchState drops
// anything unrecognized (a hand-edited URL can't crash the page).
export const Route = createFileRoute('/_authenticated/search')({
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>): SearchPageState =>
    validateSearchState(search),
})
