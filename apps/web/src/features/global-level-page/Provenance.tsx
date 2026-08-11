import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { provenanceParts } from './display'

/**
 * Provenance renders as a muted footer line beneath the content — NOT a card.
 * It only matters when something is off (a manual/unverified row, a stale
 * last-checked date), so it stays quiet until looked at.
 */
export function Provenance({ level }: { level: GlobalLevelPageData }) {
  return (
    <p className="text-[11px] leading-relaxed text-text-tertiary">
      {provenanceParts(level).join(' · ')}
    </p>
  )
}
