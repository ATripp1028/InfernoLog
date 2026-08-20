import type { LevelPageData } from './types'

/**
 * Which entry the level page's FAB targets, being the one "edit this entry"
 * affordance there that isn't scoped to a specific Timeline card. Mirrors the
 * fallback `applyEdit` used server-side back when progressUpdateId was
 * optional: completion-first, else the most recent entry (progressUpdates is
 * already loggedAt-desc from the API).
 *
 * The list page's edit modal is completion-first too, but falls back to the
 * date a run happened rather than to loggedAt, and lets the user switch from
 * there. See {@link defaultEntryChoice}.
 */
export function findPrimaryProgressUpdateId(
  data: LevelPageData
): string | null {
  const completion = data.progressUpdates.find((u) => u.kind === 'COMPLETION')
  if (completion) return completion.progressUpdateId
  return data.progressUpdates[0]?.progressUpdateId ?? null
}
