// The ordered-collection search box: which entries a typed query keeps.

import type { CollectionEntry } from '@/lib/api/collections'

/**
 * Whether an entry matches the ordered-list search — its level name, creator,
 * or ID contains the query, case-insensitively. A blank query keeps everything.
 */
export function entryMatches(entry: CollectionEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const { level } = entry
  return (
    (level.name?.toLowerCase().includes(q) ?? false) ||
    (level.creator?.toLowerCase().includes(q) ?? false) ||
    level.inGameId.includes(q)
  )
}
