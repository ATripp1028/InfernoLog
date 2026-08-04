import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useLevelBrowse } from '@/lib/api/levelBrowse'
import {
  browseApiQueryString,
  canEscalateToGd,
  hasActiveFilters,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { useSearchPageBar } from '@/features/search/useSearchPageBar'
import { useEscalation } from '@/features/search/useEscalation'
import { SearchPageBar } from '@/features/search/SearchPageBar'
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

  // The RobTop offer is shown whenever a browse is running and we're not mid
  // level-id jump. It's greyed (not hidden) whenever the current query/filters
  // can't be forwarded to GD's servers — creator search, or a cache-only
  // refinement like exact coin count / coinsVerified / official-song — so the
  // button never fires a request the escalation endpoint would reject with a
  // 400 (which the UI would misreport as "couldn't reach GD's servers").
  const offerVisible = enabled && !bar.numericId
  const canEscalate = canEscalateToGd(state)

  return (
    // Match the app's standard page padding (List/Ranking use p-4 md:p-6); the
    // extra bottom padding clears the fixed RobTop offer + mobile nav.
    <div className="p-4 pb-24 md:p-6">
      <SearchPageBar
        bar={bar}
        state={state}
        onChange={update}
        onReset={resetFilters}
        autoFocus
      />

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
          disabled={!canEscalate}
        />
      )}
    </div>
  )
}
