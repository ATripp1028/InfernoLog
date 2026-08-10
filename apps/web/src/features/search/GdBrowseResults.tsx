import { useLocation, useNavigate } from '@tanstack/react-router'
import type { LevelSearchResult } from '@/lib/api/logging'
import { backOriginState } from '@/lib/backOrigin'
import { SearchResultRow } from './SearchResultRow'
import type { useEscalation } from './useEscalation'
import { SectionLabel } from '@/components/inputs/SectionLabel'

/**
 * The GD-server escalation outcome, rendered as a trailing section under the
 * cache results on the /search page (first page only — GD search is never
 * cursor-paginated). Rated survivors are already seeded; picking an unrated one
 * seeds just that level (via its Global Level Page on navigation).
 */
export function GdBrowseResults({
  escalation,
}: {
  escalation: ReturnType<typeof useEscalation>
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const result = escalation.result

  // Nothing to render until an escalation has been fired for this search.
  if (escalation.escalatedQuery === null || escalation.isPending) return null

  const go = (levelId: string) =>
    navigate({
      to: '/levels/$levelId',
      params: { levelId },
      state: backOriginState(location.href),
    })

  if (result?.status === 'ok') {
    return (
      <div className="mt-4 border-t border-border-subtle pt-3">
        <SectionLabel size="xs" tone="accent" className="mb-2">
          From GD’s servers · rated (cached)
        </SectionLabel>
        <div className="overflow-hidden rounded-card border border-border-subtle">
          {result.rated.map((level: LevelSearchResult) => (
            <SearchResultRow
              key={level.inGameId}
              level={level}
              onSelect={() => go(level.inGameId)}
            />
          ))}
          {result.unrated.length > 0 &&
            result.unrated.map((level: LevelSearchResult) => (
              <SearchResultRow
                key={level.inGameId}
                level={level}
                onSelect={() => go(level.inGameId)}
                dimmed
              />
            ))}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-text-tertiary">
          First page of GD results, rated grouped first. Levels already in the
          cache are omitted. Selecting an unrated level seeds only that one.
        </p>
      </div>
    )
  }

  if (result?.status === 'nothing_new') {
    return (
      <div className="mt-4 border-t border-border-subtle pt-3">
        <p className="text-sm font-medium text-text-primary">
          Nothing new on GD’s servers
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          {result.totalFound > 0
            ? `All ${result.totalFound} result${result.totalFound === 1 ? '' : 's'} are already in the cache and shown above.`
            : 'GD’s servers returned no matches.'}
        </p>
      </div>
    )
  }

  // unreachable / unexpected failure — retryable.
  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <p className="text-sm font-medium text-text-primary">
        Couldn’t reach GD’s servers
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        The request didn’t go through — this says nothing about whether the
        level exists.
      </p>
    </div>
  )
}
