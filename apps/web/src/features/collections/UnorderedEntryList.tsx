import { Loader2 } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { EmptyState } from '@/components/data/EmptyState'
import { LevelSearchBar } from '@/components/inputs/levelSearch/LevelSearchBar'
import type { CollectionDetail } from '@/lib/api/collections'
import { COLLECTION_SORT_OPTIONS } from './collectionBrowseState'
import { UnorderedRow } from './CollectionEntryRow'
import { useUnorderedEntryList } from './useUnorderedEntryList'

/**
 * An unordered collection's levels: the /search page's bar (query, sort,
 * filters) over the collection's own levels, level-ID order by default. Each
 * row shows the figures the list is sorted and filtered by, and a remove
 * button. Logic lives in useUnorderedEntryList.
 */
export function UnorderedEntryList({
  collection,
  removingEntryIds,
  onRemove,
}: {
  collection: CollectionDetail
  // As useMutationState reports them — a pending removal's variables may be
  // missing, hence the undefined.
  removingEntryIds: ReadonlyArray<string | undefined>
  onRemove: (entryId: string) => void
}) {
  // Destructured, not read off one object: the return carries a ref, and the
  // React compiler treats every property read on it as a ref read in render.
  const {
    state,
    bar,
    update,
    resetFilters,
    clearSearch,
    narrowed,
    status,
    retry,
    rows,
    statKeys,
    sentinelRef,
    isFetchingNextPage,
  } = useUnorderedEntryList(collection)

  return (
    <section aria-label="Collection levels" className="flex flex-col gap-4">
      <LevelSearchBar
        bar={bar}
        state={state}
        onChange={update}
        onReset={resetFilters}
        placeholder="Search this collection by name or level ID…"
        sortOptions={COLLECTION_SORT_OPTIONS}
      />

      {status === 'error' ? (
        <div className="rounded-card border border-border-subtle bg-bg-surface p-6 text-center">
          <p className="text-sm font-medium text-text-primary">
            Couldn&apos;t load this collection&apos;s levels
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : status === 'loading' ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-card bg-bg-surface"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="No levels match"
          description="Nothing in this collection fits your search and filters."
          action={
            narrowed ? (
              <Button variant="outline" onClick={clearSearch}>
                Clear search and filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <UnorderedRow
              key={row.entryId}
              level={row}
              statKeys={statKeys}
              removing={removingEntryIds.includes(row.entryId)}
              onRemove={() => onRemove(row.entryId)}
            />
          ))}
        </div>
      )}

      {/* Sentinel + spinner for the next page. */}
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin text-primary" />
          Loading more…
        </div>
      )}
    </section>
  )
}
