// The figures behind "Add to another collection": what a copy would add to each
// candidate target, and what the toast says once it lands.

import type {
  CollectionDetail,
  CopyCollectionEntriesResult,
} from '@/lib/api/collections'

/**
 * How many of `source`'s levels a copy would add to `target`. Mirrors the
 * server's copyEntries: levels the target already holds are skipped, and so
 * are beaten levels when the target is Want to Beat.
 */
export function newLevelCount(
  source: CollectionDetail,
  target: CollectionDetail
): number {
  const inTarget = new Set(target.entries.map((e) => e.level.inGameId))
  const skipBeaten = target.type === 'WANT_TO_BEAT'
  return source.entries.filter(
    (e) => !inTarget.has(e.level.inGameId) && !(skipBeaten && e.completed)
  ).length
}

const levels = (n: number) => `${n} ${n === 1 ? 'level' : 'levels'}`

/**
 * The confirmation once a copy lands, naming anything left out for being
 * beaten.
 */
export function copyResultMessage(
  result: Pick<CopyCollectionEntriesResult, 'added' | 'skippedCompleted'>,
  targetName: string
): string {
  const head =
    result.added === 0
      ? `Nothing new to add to ${targetName}`
      : `Added ${levels(result.added)} to ${targetName}`
  return result.skippedCompleted > 0
    ? `${head} · skipped ${levels(result.skippedCompleted)} you've beaten`
    : head
}
