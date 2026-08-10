import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import type { useLevelBrowse } from '@/lib/api/levelBrowse'
import { SearchGridRow } from './SearchGridRow'

interface SearchResultsGridProps {
  query: ReturnType<typeof useLevelBrowse>
  enabled: boolean
  emptyHint: React.ReactNode
  /** Escalation (GD-server) results rendered after the cache results. */
  trailing?: React.ReactNode
}

function RowSkeleton() {
  return <div className="h-[68px] animate-pulse rounded-card bg-bg-surface" />
}

/**
 * The cache-browse results list: rows, an IntersectionObserver sentinel that
 * auto-loads the next keyset page (infinite scroll), and the loading/empty/error
 * states. Escalation results are appended via `trailing`.
 */
export function SearchResultsGrid({
  query,
  enabled,
  emptyHint,
  trailing,
}: SearchResultsGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!enabled) return null

  if (query.isError) {
    return (
      <div className="rounded-card border border-border-subtle bg-bg-surface p-6 text-center">
        <p className="text-sm font-medium text-text-primary">
          Couldn’t load results
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (query.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    )
  }

  const rows = query.data.pages.flatMap((p) => p.data)

  return (
    <div className="space-y-2">
      {/* The empty hint always renders on a zero-row cache result; any GD
          escalation results render below it via `trailing` (its copy points the
          user there). */}
      {rows.length === 0
        ? emptyHint
        : rows.map((level) => (
            <SearchGridRow key={level.inGameId} level={level} />
          ))}

      {/* Sentinel + spinner for the next page. */}
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin text-primary" />
          Loading more…
        </div>
      )}

      {trailing}
    </div>
  )
}
