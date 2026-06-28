import { useEffect, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { TooltipProvider } from '../components/ui/tooltip'
import { PageLoading } from '../components/PageLoading'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useClassicRanking } from '../lib/api/ranking'
import { RankingToolbar } from '../features/ranking/RankingToolbar'
import { RankingBoard } from '../features/ranking/RankingBoard'
import { MobileRankingList } from '../features/ranking/MobileRankingList'
import { preScrollIndex } from '../features/ranking/placement'

export function Ranking() {
  const ranking = useClassicRanking()
  const { place: placeId } = useSearch({ from: '/_authenticated/ranking' })
  const isWide = useMediaQuery('(min-width: 768px)')

  const [search, setSearch] = useState('')
  const [unplacedSearch, setUnplacedSearch] = useState('')
  // Default OFF per the design — unrated levels are hidden until toggled on.
  const [showUnrated, setShowUnrated] = useState(false)

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
            <EmptyState />
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
      <div className="flex flex-col gap-3 p-4 md:p-6">

        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            <RankingToolbar
              search={search}
              onSearch={setSearch}
              showUnrated={showUnrated}
              onShowUnrated={setShowUnrated}
            />
            <RankingBoard
              data={data}
              search={search}
              showUnrated={showUnrated}
              unplacedSearch={unplacedSearch}
              onSearchUnplaced={setUnplacedSearch}
              highlightId={placeId}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

function EmptyState() {
  return (
    <div className="mt-3 rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-10 text-center">
      <p className="text-text-primary">No completions to rank yet.</p>
      <p className="mt-1 text-sm text-text-secondary">
        Log a completion with the + button — it lands in Unplaced, ready for you
        to place.
      </p>
    </div>
  )
}
