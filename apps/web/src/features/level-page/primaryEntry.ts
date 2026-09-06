import type { LevelPageData, ProgressUpdate } from '@/lib/api/levelPage'

/**
 * The level's representative entry: completion-first, else the most recent one
 * (progressUpdates is already loggedAt-desc from the API).
 *
 * It is what the page speaks for when nothing narrower is selected — the FAB's
 * edit target, and the entry whose enjoyment feeds the level's rating (the
 * rating is level-scoped, enjoyment is per-event, so one event has to supply
 * it — the API's list serializer picks the same one).
 */
export function findPrimaryProgressUpdate(
  data: LevelPageData
): ProgressUpdate | null {
  const completion = data.progressUpdates.find((u) => u.kind === 'COMPLETION')
  return completion ?? data.progressUpdates[0] ?? null
}

/**
 * Which entry the level page's FAB targets, being the one "edit this entry"
 * affordance there that isn't scoped to a specific Timeline card. Mirrors the
 * fallback `applyEdit` used server-side back when progressUpdateId was
 * optional.
 *
 * The list page's edit modal is completion-first too, but falls back to the
 * date a run happened rather than to loggedAt, and lets the user switch from
 * there. See {@link defaultEntryChoice}.
 */
export function findPrimaryProgressUpdateId(
  data: LevelPageData
): string | null {
  return findPrimaryProgressUpdate(data)?.progressUpdateId ?? null
}
