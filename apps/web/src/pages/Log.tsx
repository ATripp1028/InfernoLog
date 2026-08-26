import { HelpCircle, Loader2 } from 'lucide-react'
import { PageLoading } from '@/components/shell/PageLoading'
import { EmptyState } from '@/components/data/EmptyState'
import { Button } from '@/components/generic/button'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import { FeedFilters } from '@/features/activity-log/FeedFilters'
import { FeedRow } from '@/features/activity-log/FeedRow'
import { GlossarySheet } from '@/features/activity-log/GlossarySheet'
import { useLogPage } from '@/features/activity-log/useLogPage'

/**
 * The Log — every event and progress entry the user has recorded, newest first.
 *
 * Ordered by when a thing was WRITTEN DOWN, not when the user says it happened:
 * a back-dated completion sits at the top of the day it was entered. That is
 * the only clock both of the tables this feed merges have, and this page is a
 * record of what was done rather than of when it happened.
 */
export function Log() {
  const {
    days,
    items,
    context,
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
    clearAll,
    canClear,
    countLabel,
    glossaryOpen,
    setGlossaryOpen,
  } = useLogPage()

  if (isLoading) return <PageLoading />

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Log</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Everything you&rsquo;ve done, newest first.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setGlossaryOpen(true)}
          className="shrink-0 gap-1.5 text-xs"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          What the log shows
        </Button>
      </div>

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
        onClear={clearAll}
        canClear={canClear}
        countLabel={countLabel}
      />

      <div className="mt-5">
        {isError ? (
          <EmptyState
            title="Couldn't load your log."
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

      <GlossarySheet open={glossaryOpen} onOpenChange={setGlossaryOpen} />
    </div>
  )
}
