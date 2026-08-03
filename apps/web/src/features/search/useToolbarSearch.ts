import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useLevelById,
  useLevelSearch,
  type Level,
  type LevelSearchResult,
} from '@/lib/api/logging'
import { sortAndCapSearchResults } from '@/lib/levelSearchResults'
import { useEscalation } from './useEscalation'

// A selectable row in the results view. `level` is the cache-search result or
// cached Level to render; a `null` level is the "go to level {id}" affordance
// for an uncached numeric id (the destination Global Level Page resolves and
// seeds it on arrival).
export interface SearchItem {
  id: string
  level: LevelSearchResult | Level | null
}

// Shared search-state for the toolbar: cache name search + numeric ID
// passthrough, both navigating to the Global Level Page (/levels/{id}).
// Reused by the desktop dropdown (AppHeader) and the mobile overlay so their
// keyboard/selection behaviour is identical. Escalation to GD's servers is
// layered on by the consumer (Part 2) — this owns only the cache side.
export function useToolbarSearch() {
  const navigate = useNavigate()
  const [query, setQueryRaw] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const escalation = useEscalation()

  // Editing the query drops any prior escalation, so the offer reappears and
  // the next escalation needs its own explicit confirm (no "escalated mode").
  const setQuery = useCallback(
    (value: string) => {
      setQueryRaw(value)
      escalation.clear()
    },
    [escalation]
  )

  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const search = useLevelSearch(query)
  const cachedLevel = useLevelById(trimmed)

  const items = useMemo<SearchItem[]>(() => {
    if (isNumeric) {
      if (trimmed.length < 4) return []
      if (cachedLevel.data) return [{ id: cachedLevel.data.inGameId, level: cachedLevel.data }]
      if (!cachedLevel.isFetching) return [{ id: trimmed, level: null }]
      return []
    }
    if (trimmed.length < 2) return []
    return sortAndCapSearchResults(search.data ?? [], () => false).map((r) => ({
      id: r.inGameId,
      level: r,
    }))
  }, [isNumeric, trimmed, cachedLevel.data, cachedLevel.isFetching, search.data])

  // Reset the keyboard highlight whenever the candidate set changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const isSearching = !isNumeric && trimmed.length >= 2 && search.isPending
  const showNoResults =
    !isNumeric && trimmed.length >= 2 && !isSearching && items.length === 0
  // Escalation is offered on a real text query once the cache has answered —
  // both on zero results and on partial hits (the cache may not hold the one
  // meant). Never for a numeric id (that already reaches any level directly).
  const canEscalate = !isNumeric && trimmed.length >= 2 && !isSearching

  const go = useCallback(
    (levelId: string) => {
      navigate({ to: '/levels/$levelId', params: { levelId } })
    },
    [navigate]
  )

  const reset = useCallback(() => {
    setQuery('')
    setActiveIndex(0)
  }, [setQuery])

  // Whether the current query has already been escalated (its GD results are
  // showing) — gates Enter so a second Enter doesn't re-fire the request.
  const escalated = escalation.escalatedQuery === trimmed && trimmed.length > 0

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' && items.length > 0) {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % items.length)
      } else if (e.key === 'ArrowUp' && items.length > 0) {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + items.length) % items.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        // Enter escalates when the offer is showing (matches the `↵ Enter`
        // affordance on the escalation row); otherwise it opens the highlighted
        // cache result.
        if (canEscalate && !escalated && !escalation.isPending) {
          escalation.escalate(trimmed)
          return
        }
        const item = items[activeIndex]
        if (item) go(item.id)
      }
    },
    [items, activeIndex, go, canEscalate, escalated, escalation, trimmed]
  )

  return {
    query,
    setQuery,
    trimmed,
    isNumeric,
    items,
    isSearching,
    showNoResults,
    canEscalate,
    escalated,
    escalation,
    activeIndex,
    setActiveIndex,
    handleKeyDown,
    go,
    reset,
  }
}
