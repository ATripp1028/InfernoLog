import { useEffect, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PageLoading } from '@/components/PageLoading'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useClassicRanking } from '@/lib/api/ranking'
import { RankingToolbar } from '@/features/ranking/RankingToolbar'
import { RankingBoard } from '@/features/ranking/RankingBoard'
import { MobileRankingList } from '@/features/ranking/MobileRankingList'
import { preScrollIndex } from '@/features/ranking/placement'
import { EmptyState } from '@/components/EmptyState'

/**
 * The personal classic ranking — every completion ordered by how hard the user found it.
 */
export function Ranking() {
  const ranking = useClassicRanking()
  const { place: placeId } = useSearch({ from: '/_authenticated/ranking' })
  const isWide = useMediaQuery('(min-width: 768px)')

  const [search, setSearch] = useState('')
  const [unplacedSearch, setUnplacedSearch] = useState('')
  // Default ON — a user who went out of their way to log an unrated level
  // almost certainly wants it visible; toggle off to hide them instead.
  const [showUnrated, setShowUnrated] = useState(true)

  const data = ranking.data

  // Post-log handoff: once data is loaded, bring the ranked list's tier spot
  // into view so the user sees where the fresh completion will land. The card
  // itself is highlighted via `highlightId`. Runs once per `place` target.
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!placeId || !data) return
    if (scrolledFor.current === placeId) return
    scrolledFor.current = placeId
    const target = data.unplaced.find((u) => u.levelProgressId === placeId)
    const idx = preScrollIndex(data.placed, target?.badge ?? null)
    const anchor = data.placed[idx]
    const el = document.getElementById(
      anchor ? `rk-${anchor.levelProgressId}` : `rk-${placeId}`
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [placeId, data])

  if (ranking.isPending || !data) return <PageLoading />

  const isEmpty = data.placed.length === 0 && data.unplaced.length === 0

  if (!isWide) {
    return (
      <div className="p-4">
        {isEmpty ? (
          <>
            <h1 className="text-2xl font-semibold text-text-primary">
              Ranking
            </h1>
            <EmptyState
              className="mt-3"
              title="No completions to rank yet."
              description="Log a completion with the + button — it lands in Unplaced, ready for you to place."
            />
          </>
        ) : (
          <MobileRankingList
            data={data}
            search={search}
            onSearch={setSearch}
            showUnrated={showUnrated}
            onShowUnrated={setShowUnrated}
            highlightId={placeId}
          />
        )}
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col gap-3 p-4 md:p-6">
        {isEmpty ? (
          <EmptyState
            className="mt-3"
            title="No completions to rank yet."
            description="Log a completion with the + button — it lands in Unplaced, ready for you to place."
          />
        ) : (
          <>
            <RankingToolbar
              search={search}
              onSearch={setSearch}
              showUnrated={showUnrated}
              onShowUnrated={setShowUnrated}
            />
            <div className="min-h-0 flex-1">
              <RankingBoard
                data={data}
                search={search}
                showUnrated={showUnrated}
                unplacedSearch={unplacedSearch}
                onSearchUnplaced={setUnplacedSearch}
                highlightId={placeId}
              />
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
