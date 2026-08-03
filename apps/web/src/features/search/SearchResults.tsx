import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GdSearchSection } from './GdSearchSection'
import { SearchResultRow } from './SearchResultRow'
import type { useToolbarSearch } from './useToolbarSearch'

type ToolbarSearchState = ReturnType<typeof useToolbarSearch>

interface SearchResultsProps {
  state: ToolbarSearchState
  /** Mobile overlay sizing/padding vs desktop dropdown. */
  compact?: boolean
  /** Called after any row selection (so the container can close/dismiss). */
  onAfterSelect?: () => void
}

// The shared results body: `FROM YOUR CACHE` group + rows, the numeric
// go-to-id affordance, the no-results state, and the (Part 1 inert) escalation
// offer. Rendered inside both the desktop dropdown panel and the mobile
// full-screen overlay.
export function SearchResults({
  state,
  compact = false,
  onAfterSelect,
}: SearchResultsProps) {
  const {
    items,
    isNumeric,
    isSearching,
    showNoResults,
    canEscalate,
    escalation,
    activeIndex,
    setActiveIndex,
    go,
    trimmed,
  } = state

  const pad = compact ? 'px-4' : 'px-5'

  function select(levelId: string) {
    go(levelId)
    onAfterSelect?.()
  }

  const hasResults = items.length > 0
  // Only phrase the offer as "not the one you meant?" when the escalation is
  // still being offered (i.e. cache results are showing above it). Once
  // escalated, GdSearchSection owns the copy.
  const offer = {
    title: hasResults
      ? `Not the level you meant? Search GD's servers for "${trimmed}" or enter a level ID`
      : `Search GD's servers for "${trimmed}" or enter a level ID`,
    subtitle: compact
      ? 'One request. Levels already cached are omitted.'
      : hasResults
        ? 'One request to RobTop. Levels already cached are omitted from the results.'
        : "One request to RobTop's servers. Requires confirmation — never automatic.",
  }

  return (
    <div className="flex flex-col">
      {isSearching && (
        <p className={cn('py-3 text-sm text-text-tertiary', pad)}>Searching…</p>
      )}

      {!isSearching && hasResults && (
        <>
          {!isNumeric && (
            <p
              className={cn(
                'pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary',
                pad
              )}
            >
              From your cache
            </p>
          )}
          {items.map((item, i) =>
            item.level ? (
              <SearchResultRow
                key={item.id}
                level={item.level}
                active={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onSelect={() => select(item.id)}
                compact={compact}
              />
            ) : (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(item.id)}
                className={cn(
                  'flex h-14 w-full items-center gap-3 text-left text-sm text-text-primary transition-colors',
                  pad,
                  i === activeIndex
                    ? 'bg-white/[0.06]'
                    : 'hover:bg-white/[0.03]'
                )}
              >
                <ArrowRight size={16} className="shrink-0 text-text-tertiary" />
                Go to level {item.id}
              </button>
            )
          )}
        </>
      )}

      {showNoResults && (
        <div className={cn('py-4', pad)}>
          <p className="text-sm font-medium text-text-primary">
            No cached level matches “{trimmed}”
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            The cache only holds levels someone has already logged or found.
          </p>
        </div>
      )}

      {canEscalate && (
        <>
          <div className="h-px bg-[#2e2e2e]" />
          <GdSearchSection
            escalation={escalation}
            query={trimmed}
            onSelect={select}
            offer={offer}
            compact={compact}
            showEnterHint={!compact}
          />
        </>
      )}
    </div>
  )
}
