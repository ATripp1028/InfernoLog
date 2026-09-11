import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { backOriginState } from '@/lib/backOrigin'
import {
  hasActiveFilters,
  type LevelSearchBy,
  type SearchPageState,
} from '@/lib/levelSearchParams'

const DEBOUNCE_MS = 250

/**
 * What differs between the pages that host the bar.
 */
export interface LevelSearchBarOptions {
  /**
   * Writes the next search state to the URL. The caller picks the route, and
   * should replace rather than push so typing doesn't fill the back button.
   */
  commit: (next: SearchPageState) => void
  /**
   * Whether a digits-only name query is a level id to jump to (the /search
   * page) or an ordinary query (a collection, whose browse matches it against
   * its own levels' ids). Defaults to true.
   */
  levelIdJump?: boolean
}

/**
 * State for a level search bar — the /search page's, and an unordered
 * collection's. The text query and search-by mode are LIVE: editing either
 * debounces into the URL through `commit`, which re-runs the results — no Enter
 * required. Enter still flushes immediately, and (with `levelIdJump`) a
 * numeric-only input is a level id that jumps straight to its Global Level Page
 * (a browse can't auto-navigate on every keystroke).
 */
export function useLevelSearchBar(
  committed: SearchPageState,
  { commit, levelIdJump = true }: LevelSearchBarOptions
) {
  const navigate = useNavigate()
  const location = useLocation()
  // Held in a ref so a caller passing a fresh arrow each render doesn't reset
  // the debounce timer on every unrelated re-render.
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  const [query, setQuery] = useState(committed.query ?? '')
  const [searchBy, setSearchBy] = useState<LevelSearchBy>(committed.searchBy)
  // Whether the inline filter panel under the bar is expanded. It starts open
  // when the URL already carries filters, so a shared or restored search shows
  // what it is filtering on instead of hiding it behind a dot on the button.
  const [filtersOpen, setFiltersOpen] = useState(() =>
    hasActiveFilters(committed)
  )
  const toggleFilters = useCallback(() => setFiltersOpen((open) => !open), [])

  // Always-current committed state for the debounced push (avoids resetting the
  // debounce timer when unrelated params — filters/sort — change). Updated in an
  // effect (never during render) but always before the debounce timeout fires.
  const committedRef = useRef(committed)
  useEffect(() => {
    committedRef.current = committed
  })
  // The value we last pushed to the URL, so the sync-from-URL effects can tell
  // our own echo apart from an external navigation (back/forward, a link).
  const lastQuery = useRef(committed.query)
  const lastSearchBy = useRef(committed.searchBy)

  const trimmed = query.trim()
  // A digits-only input is a level id only when searching by name; in creator
  // mode it's a (numeric) creator name to browse, not a level to jump to.
  const isNumeric =
    levelIdJump && searchBy === 'name' && /^\d+$/.test(trimmed)
  const numericId = isNumeric && trimmed.length > 0 ? trimmed : null
  // The browse query the current input commits to: a numeric id is NOT a browse
  // term (it jumps via Enter), so it clears the committed query.
  const effectiveQuery = isNumeric || trimmed.length === 0 ? undefined : trimmed

  const push = useCallback(
    (nextQuery: string | undefined, nextSearchBy: LevelSearchBy) => {
      lastQuery.current = nextQuery
      lastSearchBy.current = nextSearchBy
      commitRef.current({
        ...committedRef.current,
        query: nextQuery,
        searchBy: nextSearchBy,
      })
    },
    []
  )

  // Debounced live commit as the user types / switches mode.
  useEffect(() => {
    const handle = setTimeout(() => {
      const cur = committedRef.current
      if (effectiveQuery === cur.query && searchBy === cur.searchBy) return
      push(effectiveQuery, searchBy)
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [effectiveQuery, searchBy, push])

  // Re-sync from the URL only on external changes (not our own debounced echo).
  useEffect(() => {
    if (committed.query !== lastQuery.current) setQuery(committed.query ?? '')
  }, [committed.query])
  useEffect(() => {
    if (committed.searchBy !== lastSearchBy.current)
      setSearchBy(committed.searchBy)
  }, [committed.searchBy])

  const goToLevel = useCallback(
    (levelId: string) => {
      navigate({
        to: '/levels/$levelId',
        params: { levelId },
        state: backOriginState(location.href),
      })
    },
    [navigate, location.href]
  )

  // Enter: jump to a numeric id, otherwise flush the pending debounce so the
  // search runs now instead of after the delay.
  const submit = useCallback(() => {
    if (numericId) {
      goToLevel(numericId)
      return
    }
    push(effectiveQuery, searchBy)
  }, [numericId, effectiveQuery, searchBy, goToLevel, push])

  return {
    query,
    setQuery,
    searchBy,
    setSearchBy,
    numericId,
    goToLevel,
    submit,
    filtersOpen,
    toggleFilters,
  }
}
