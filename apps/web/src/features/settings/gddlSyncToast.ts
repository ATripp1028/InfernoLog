// The copy each GDDL sync reports back with. Two syncs, two shapes: the
// completion sync (pulling levels in from GDDL) and the list sync (favorites
// / least-favorites, which moves in both directions).
//
// Extracted from GddlSyncProvider and GddlApiKeyEditor so the pluralisation
// and the "nothing happened" fallbacks can be exercised without mounting
// either.

import type { GddlListSyncResult, GddlSyncResult } from '@/lib/api/me'

// "1 level" / "2 levels" — the two builders below both count levels.
const levels = (n: number) => `${n} level${n === 1 ? '' : 's'}`

/**
 * The toast for a completed completion-sync.
 *
 * A sync that found nothing still reports, so the user knows it ran rather
 * than silently doing nothing. Errors are appended rather than replacing the
 * summary — some levels importing and some failing is the common case.
 */
export function buildSyncToast(result: GddlSyncResult): string {
  const parts: string[] = []
  if (result.created > 0)
    parts.push(
      `${result.created} completion${result.created === 1 ? '' : 's'} added`
    )
  if (result.enriched > 0) parts.push(`${result.enriched} enriched`)
  const summary = parts.length > 0 ? parts.join(', ') : 'Nothing new to import'
  if (result.errors.length > 0) {
    return `Sync complete — ${summary} · ${levels(result.errors.length)} could not be imported`
  }
  return `Sync complete — ${summary}`
}

/**
 * The toast for a completed list-sync.
 *
 * Favorites and least-favorites are summed rather than reported separately —
 * the user asked to sync "their lists", and two near-identical clauses read
 * worse than one total.
 */
export function buildListSyncToast(result: GddlListSyncResult): string {
  const totalAdded =
    result.favorites.addedToInferno.length +
    result.leastFavorites.addedToInferno.length
  const totalPushed =
    result.favorites.addedToGddl.length +
    result.leastFavorites.addedToGddl.length
  const totalRemoved =
    result.favorites.removedFromGddl.length +
    result.leastFavorites.removedFromGddl.length
  const totalSkipped =
    result.favorites.skipped.length + result.leastFavorites.skipped.length

  const parts: string[] = []
  if (totalAdded > 0) parts.push(`${levels(totalAdded)} added to InfernoLog`)
  if (totalPushed > 0) parts.push(`${totalPushed} pushed to GDDL`)
  if (totalRemoved > 0) parts.push(`${totalRemoved} removed from GDDL`)
  const summary = parts.length > 0 ? parts.join(', ') : 'Nothing to sync'
  return totalSkipped > 0
    ? `Lists synced — ${summary} · ${levels(totalSkipped)} could not be cached`
    : `Lists synced — ${summary}`
}
