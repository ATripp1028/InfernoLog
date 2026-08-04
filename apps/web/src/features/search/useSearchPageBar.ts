import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { LevelSearchBy, SearchPageState } from '@/lib/levelSearchParams'

const DEBOUNCE_MS = 250

// State for the /search page's search bar. The text query and search-by mode are
// LIVE: editing either debounces into the URL (replace, no history spam), which
// re-runs the results grid — no Enter required. Enter still flushes immediately,
// and a numeric-only input is a level id that jumps straight to its Global Level
// Page (a browse can't auto-navigate on every keystroke).
export function useSearchPageBar(committed: SearchPageState) {
  const navigate = useNavigate()
  const [query, setQuery] = useState(committed.query ?? '')
  const [searchBy, setSearchBy] = useState<LevelSearchBy>(committed.searchBy)

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
  const isNumeric = searchBy === 'name' && /^\d+$/.test(trimmed)
  const numericId = isNumeric && trimmed.length > 0 ? trimmed : null
  // The browse query the current input commits to: a numeric id is NOT a browse
  // term (it jumps via Enter), so it clears the committed query.
  const effectiveQuery = isNumeric || trimmed.length === 0 ? undefined : trimmed

  const push = useCallback(
    (nextQuery: string | undefined, nextSearchBy: LevelSearchBy) => {
      lastQuery.current = nextQuery
      lastSearchBy.current = nextSearchBy
      navigate({
        to: '/search',
        replace: true,
        search: {
          ...committedRef.current,
          query: nextQuery,
          searchBy: nextSearchBy,
        },
      })
    },
    [navigate]
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
      navigate({ to: '/levels/$levelId', params: { levelId } })
    },
    [navigate]
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
  }
}
