import type { LevelPageData } from './types'

/**
 * Which entry an "edit this entry" affordance targets when it isn't scoped
 * to one specific Timeline card (the level page's FAB, the list page's row
 * action). Mirrors the fallback `applyEdit` used server-side back when
 * progressUpdateId was optional: completion-first, else the most recent
 * entry (progressUpdates is already loggedAt-desc from the API).
 */
export function findPrimaryProgressUpdateId(
  data: LevelPageData
): string | null {
  const completion = data.progressUpdates.find((u) => u.kind === 'COMPLETION')
  if (completion) return completion.progressUpdateId
  return data.progressUpdates[0]?.progressUpdateId ?? null
}
