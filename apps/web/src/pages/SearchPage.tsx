import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { useLevelBrowse } from '@/lib/api/levelBrowse'
import {
  browseApiQueryString,
  hasActiveFilters,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { useSearchPageBar } from '@/features/search/useSearchPageBar'
import { useEscalation } from '@/features/search/useEscalation'
import { SearchPageBar } from '@/features/search/SearchPageBar'
import { SearchFilters } from '@/features/search/SearchFilters'
import { SearchResultsGrid } from '@/features/search/SearchResultsGrid'
import { GdBrowseResults } from '@/features/search/GdBrowseResults'
import { RobtopSearchOffer } from '@/features/search/RobtopSearchOffer'

// The Search tab. A top-center bar commits a full, filterable, cursor-paginated
// cache search to the URL (/search?query=…); the results grid, filters, sort,
// and the opt-in RobTop escalation all read from that URL state. Numeric input
// is treated as a level id and routed to the Global Level Page (in the bar).
export function SearchPage() {
  const state = useSearch({ from: '/_authenticated/search' })
  const navigate = useNavigate()
  const bar = useSearchPageBar(state)
  const escalation = useEscalation()
  const [showFilters, setShowFilters] = useState(hasActiveFilters(state))

  const query = state.query?.trim() ?? ''
  const filtersActive = hasActiveFilters(state)
  const browsableSort = state.sort === 'downloads' || state.sort === 'likes'
  // A search runs once there's a query, an active filter, or a browsable sort
  // (most downloaded/liked). The default (relevance, empty) shows an idle prompt.
  const enabled = query.length > 0 || filtersActive || browsableSort

  const browse = useLevelBrowse(state, enabled)

  // Editing the committed search drops any prior escalation, so the offer
  // reappears and the next escalation needs its own explicit confirm.
  const stateKey = browseApiQueryString(state)
  useEffect(() => {
    escalation.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey])

  const update = (patch: Partial<SearchPageState>) =>
    navigate({
      to: '/search',
      replace: true,
      search: { ...state, ...patch },
    })

  const resetFilters = () =>
    navigate({
      to: '/search',
      replace: true,
      search: { query: state.query, searchBy: state.searchBy, sort: state.sort },
    })

  // The RobTop offer: a real (non-id) query or a browsable filter/sort, cache
  // results in view. Greyed (not hidden) in creator mode — GD has no creator
  // search. Hidden on the idle/empty state and while a numeric id is being typed
  // (that jumps to the level page, it isn't a browse).
  const offerVisible = enabled && !bar.numericId

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-28 pt-6 md:pt-10">
      <SearchPageBar bar={bar} autoFocus />

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={16} />
          Filters &amp; sort
          {filtersActive && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
              on
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="mt-3">
          <SearchFilters
            state={state}
            onChange={update}
            onReset={resetFilters}
            hasFilters={filtersActive}
          />
        </div>
      )}

      <div className="mt-6">
        {enabled ? (
          <SearchResultsGrid
            query={browse}
            enabled={enabled}
            emptyHint={
              <div className="rounded-card border border-border-subtle bg-bg-surface p-6 text-center">
                <p className="text-sm font-medium text-text-primary">
                  No cached level matches your search
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  The cache only holds levels someone has already logged or
                  found. Try RobTop’s servers below.
                </p>
              </div>
            }
            trailing={<GdBrowseResults escalation={escalation} />}
          />
        ) : (
          <div className="rounded-card border border-dashed border-border-subtle p-8 text-center">
            <p className="text-sm font-medium text-text-primary">
              Search the level cache
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              Search by name or creator, enter a level ID, or pick filters to
              browse.
            </p>
          </div>
        )}
      </div>

      {offerVisible && (
        <RobtopSearchOffer
          escalation={escalation}
          state={state}
          disabled={state.searchBy === 'creator'}
        />
      )}
    </div>
  )
}
