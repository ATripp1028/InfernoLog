import { Loader2, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SearchPageState } from '@/lib/levelSearchParams'
import type { useEscalation } from './useEscalation'

interface RobtopSearchOfferProps {
  escalation: ReturnType<typeof useEscalation>
  state: SearchPageState
  /**
   * The current query/filters can't be forwarded to GD's servers (creator
   * search, or a cache-only refinement), so the offer is greyed out — clicking
   * it would only earn a rejection from the escalation endpoint.
   */
  disabled: boolean
}

// The floating "search GD's servers" affordance, pinned to the bottom center of
// the /search page. Shown only when the current search is a browsable GD
// operation (see SearchPage). One request, first page only — never automatic.
// Once escalated, the results/errors render in the grid (GdBrowseResults) and
// this collapses to nothing but the in-flight spinner.
export function RobtopSearchOffer({
  escalation,
  state,
  disabled,
}: RobtopSearchOfferProps) {
  const wrapper =
    'pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 md:bottom-6'

  if (escalation.isPending) {
    return (
      <div className={wrapper}>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#333333] bg-[#212121] px-4 py-2.5 text-sm text-text-secondary shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <Loader2 size={16} className="animate-spin text-primary" />
          Searching GD’s servers…
        </div>
      </div>
    )
  }

  // Already escalated for this search — the grid shows the outcome.
  if (escalation.escalatedQuery !== null) return null

  return (
    <div className={wrapper}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => escalation.escalate(state)}
        title={
          disabled
            ? 'These search terms can’t be forwarded to RobTop’s servers — try a level name, difficulty, length, coins, two-player, or a downloads/likes sort'
            : undefined
        }
        className={cn(
          'pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors',
          disabled
            ? 'cursor-not-allowed border-[#2a2a2a] bg-[#1a1a1a] text-text-tertiary'
            : 'border-primary/50 bg-[#212121] text-text-primary hover:border-primary'
        )}
      >
        <Server size={16} className={disabled ? '' : 'text-primary'} />
        {disabled
          ? 'RobTop can’t search these terms'
          : "Not finding it? Search RobTop’s servers"}
      </button>
    </div>
  )
}
