import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LevelSearchResult } from '@/lib/api/logging'
import { EscalationRow } from './EscalationRow'
import { SearchResultRow } from './SearchResultRow'
import type { useEscalation } from './useEscalation'

interface GdSearchSectionProps {
  escalation: ReturnType<typeof useEscalation>
  /** The trimmed query the offer/escalation is for. */
  query: string
  onSelect: (levelId: string) => void
  /** Contextual offer copy — each call site phrases it to fit (2.7). */
  offer: { title: string; subtitle: string }
  compact?: boolean
  showEnterHint?: boolean
}

/**
 * The escalation portion shared across the toolbar, logging-flow entry, and
 * collections add: the opt-in offer, then (on confirm) the GD-server results
 * grouped rated/unrated, the "nothing new" state, or a retryable failure.
 * Every result row is a brand-new-to-cache level (already-cached levels are
 * deduped server-side), so no already-logged greying is needed here.
 */
export function GdSearchSection({
  escalation,
  query,
  onSelect,
  offer,
  compact = false,
  showEnterHint = false,
}: GdSearchSectionProps) {
  const pad = compact ? 'px-4' : 'px-5'

  // Not escalated for the *current* query → show the offer. (Editing the query
  // clears any prior escalation, so this reappears and re-requires a confirm.)
  if (escalation.escalatedQuery !== query) {
    return (
      <EscalationRow
        title={offer.title}
        subtitle={offer.subtitle}
        onConfirm={() => escalation.escalate(query)}
        showEnterHint={showEnterHint}
        compact={compact}
      />
    )
  }

  if (escalation.isPending) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 py-3 text-sm text-text-secondary',
          pad
        )}
      >
        <Loader2 size={16} className="animate-spin text-primary" />
        Searching GD’s servers…
      </div>
    )
  }

  const result = escalation.result

  if (result?.status === 'ok') {
    return (
      <GdResults
        rated={result.rated}
        unrated={result.unrated}
        onSelect={onSelect}
        compact={compact}
      />
    )
  }

  if (result?.status === 'nothing_new') {
    return (
      <div className={cn('py-4', pad)}>
        <p className="text-sm font-medium text-text-primary">
          Nothing new on GD’s servers
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          {result.totalFound > 0
            ? `All ${result.totalFound} result${result.totalFound === 1 ? '' : 's'} for “${query}” are already in the cache and shown above.`
            : `GD’s servers returned no matches for “${query}”.`}
        </p>
        <p className="mt-2 text-[11px] text-text-tertiary">
          Distinct from an error — the request succeeded and found only known
          levels.
        </p>
      </div>
    )
  }

  // unreachable (503) or an unexpected failure — retryable.
  return (
    <div className={cn('py-4', pad)}>
      <p className="text-sm font-medium text-text-primary">
        Couldn’t reach GD’s servers
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        The request didn’t go through. This says nothing about whether the level
        exists.
      </p>
      <button
        type="button"
        onClick={() => escalation.escalate(query)}
        className="mt-2 text-xs font-medium text-primary hover:underline"
      >
        Try again
      </button>
    </div>
  )
}

function GroupHeader({
  children,
  accent = false,
  compact = false,
}: {
  children: React.ReactNode
  accent?: boolean
  compact?: boolean
}) {
  return (
    <p
      className={cn(
        'pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wide',
        compact ? 'px-4' : 'px-5',
        accent ? 'text-accent-hover' : 'text-text-secondary'
      )}
    >
      {children}
    </p>
  )
}

function GdResults({
  rated,
  unrated,
  onSelect,
  compact = false,
}: {
  rated: LevelSearchResult[]
  unrated: LevelSearchResult[]
  onSelect: (levelId: string) => void
  compact?: boolean
}) {
  return (
    <div className="flex flex-col">
      {rated.length > 0 && (
        <>
          <GroupHeader accent compact={compact}>
            Rated · cached automatically
          </GroupHeader>
          {rated.map((level) => (
            <SearchResultRow
              key={level.inGameId}
              level={level}
              onSelect={() => onSelect(level.inGameId)}
              compact={compact}
            />
          ))}
        </>
      )}

      {unrated.length > 0 && (
        <>
          <GroupHeader compact={compact}>
            Unrated · cached only if you pick one
          </GroupHeader>
          {unrated.map((level) => (
            <SearchResultRow
              key={level.inGameId}
              level={level}
              onSelect={() => onSelect(level.inGameId)}
              compact={compact}
              dimmed
            />
          ))}
        </>
      )}

      <p
        className={cn(
          'py-2.5 text-[11px] leading-4 text-text-tertiary',
          compact ? 'px-4' : 'px-5'
        )}
      >
        First page of GD results, rated grouped first. Levels already in the
        cache are omitted. Selecting an unrated level seeds only that one, so
        noclips, autos and startpos copies never enter the cache.
      </p>
    </div>
  )
}
