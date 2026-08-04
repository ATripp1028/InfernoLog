import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useLevelById,
  useLevelSearch,
  type Level,
  type LevelSearchResult,
} from '@/lib/api/logging'
import { sortAndCapSearchResults } from '@/lib/levelSearchResults'
import type { LevelSearchBy, SearchPageState } from '@/lib/levelSearchParams'

// A dropdown suggestion. `level === null` is the "go to level {id}" affordance
// for an uncached numeric id (mirrors the toolbar).
export interface BarItem {
  id: string
  level: LevelSearchResult | Level | null
}

// State for the /search page's search bar. Unlike the toolbar (useToolbarSearch),
// pressing Enter / the Search button COMMITS a full paginated search by
// navigating to /search?query=… (the reason this page exists) — except a
// numeric-only input, which is treated as a level id and goes straight to its
// Global Level Page. The live cache dropdown (name mode only) is kept so
// clicking a suggestion still opens that level directly.
export function useSearchPageBar(committed: SearchPageState) {
  const navigate = useNavigate()
  const [query, setQuery] = useState(committed.query ?? '')
  const [searchBy, setSearchBy] = useState<LevelSearchBy>(committed.searchBy)
  const [open, setOpen] = useState(false)

  // Re-sync when the committed URL changes out from under us (back/forward, a
  // suggestion click elsewhere, etc.).
  useEffect(() => setQuery(committed.query ?? ''), [committed.query])
  useEffect(() => setSearchBy(committed.searchBy), [committed.searchBy])

  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  // The cache autocomplete searches level names only, so the live dropdown is
  // name-mode only; creator mode commits straight to a creator browse.
  const nameMode = searchBy === 'name'
  const search = useLevelSearch(nameMode ? query : '')
  const cachedLevel = useLevelById(nameMode ? trimmed : '')

  const items = useMemo<BarItem[]>(() => {
    if (!nameMode) return []
    if (isNumeric) {
      if (trimmed.length < 4) return []
      if (cachedLevel.data)
        return [{ id: cachedLevel.data.inGameId, level: cachedLevel.data }]
      if (!cachedLevel.isFetching) return [{ id: trimmed, level: null }]
      return []
    }
    if (trimmed.length < 2) return []
    return sortAndCapSearchResults(search.data ?? [], () => false).map((r) => ({
      id: r.inGameId,
      level: r,
    }))
  }, [nameMode, isNumeric, trimmed, cachedLevel.data, cachedLevel.isFetching, search.data])

  const isSearching =
    nameMode && !isNumeric && trimmed.length >= 2 && search.isPending

  const goToLevel = useCallback(
    (levelId: string) => {
      setOpen(false)
      navigate({ to: '/levels/$levelId', params: { levelId } })
    },
    [navigate]
  )

  // Commit the search: numeric → the level's page; otherwise navigate to the
  // results grid, preserving the current filters/sort and applying the bar's
  // query + search-by.
  const submit = useCallback(() => {
    setOpen(false)
    if (isNumeric && trimmed.length > 0) {
      goToLevel(trimmed)
      return
    }
    navigate({
      to: '/search',
      search: {
        ...committed,
        query: trimmed.length > 0 ? trimmed : undefined,
        searchBy,
      },
    })
  }, [isNumeric, trimmed, searchBy, committed, goToLevel, navigate])

  return {
    query,
    setQuery,
    searchBy,
    setSearchBy,
    open,
    setOpen,
    items,
    isSearching,
    goToLevel,
    submit,
  }
}
