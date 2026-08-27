import { Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/data/EmptyState'
import { Button } from '@/components/generic/button'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import { FeedFilters } from '@/features/events/FeedFilters'
import { FeedRow } from '@/features/events/FeedRow'
import { useEventsPage } from '@/features/events/useEventsPage'

/**
 * The Events feed — every event and progress entry the user has recorded, newest first.
 *
 * Ordered by when a thing was WRITTEN DOWN, not when the user says it happened:
 * a back-dated completion sits at the top of the day it was entered. That is
 * the only clock both of the tables this feed merges have, and this page is a
 * record of what was done rather than of when it happened.
 */
export function Events() {
  const {
    days,
    items,
    context,
    datePref,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    kinds,
    toggleKind,
    clearKinds,
    levelId,
    setLevelId,
    levelOptions,
    range,
    setRange,
    customRange,
    setCustomRange,
    clearAll,
    canClear,
    countLabel,
  } = useEventsPage()

  return (
    <div className="mx-auto w-full md:px-6">
      <FeedFilters
        className="mt-4"
        kinds={kinds}
        onToggleKind={toggleKind}
        onClearKinds={clearKinds}
        levelId={levelId}
        onLevelChange={setLevelId}
        levelOptions={levelOptions}
        range={range}
        onRangeChange={setRange}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        datePref={datePref}
        onClear={clearAll}
        canClear={canClear}
        countLabel={countLabel}
      />

      {/* Only this region swaps while a filter loads — the header and the
          controls above stay mounted, so the chip the user just pressed does
          not disappear out from under them. */}
      <div className="mt-5">
        {isLoading ? (
          <div
            className="flex justify-center py-16"
            role="status"
            aria-label="Loading your events"
          >
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        ) : isError ? (
          <EmptyState
            title="Couldn't load your events."
            description="Something went wrong fetching it. Try again in a moment."
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing here yet."
            description={
              canClear
                ? 'Try another filter — or go log a run.'
                : 'Log a run, place a level, or edit an entry and it shows up here.'
            }
          />
        ) : (
          <div className="flex flex-col gap-5">
            {days.map((day) => (
              <section key={day.key}>
                <SectionLabel>{day.heading}</SectionLabel>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {day.items.map((item) => (
                    <FeedRow
                      key={`${item.source}-${item.id}`}
                      item={item}
                      context={context}
                    />
                  ))}
                </div>
              </section>
            ))}

            {hasNextPage && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Load older activity
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
