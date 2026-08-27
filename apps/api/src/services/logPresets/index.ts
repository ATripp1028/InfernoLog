// Purging deleted rating categories out of saved List presets.
//
// A preset's four view-config fields are opaque JSON to the rest of the API —
// `routes/presets/presets.ts` stores and returns them verbatim. This module is
// the one exception, and it exists because those blobs are the only place a
// rating category id is referenced by value rather than by foreign key:
// the frontend encodes a per-category sort/column as the string `cat:<id>`
// and a per-category range filter as a `filters.categoryRatings` key. Deleting
// the category takes its `rating_scores` with it, but nothing would touch the
// preset, so the List page would keep rendering a raw UUID where the category
// name used to be. See `apps/web/src/features/list/presets.ts` for the
// producing side of these shapes.
//
// Everything here reads the blobs defensively: an unrecognized shape is left
// exactly as stored rather than normalized, so a preset the frontend wrote in
// some future shape can never be damaged by a category deletion.

/** The `cat:` prefix the frontend uses to encode a per-category sort key or column id. */
const CATEGORY_KEY_PREFIX = 'cat:'

/** The four opaque view-config blobs of a preset, as stored. */
export interface PresetViewFields {
  sorts: unknown
  filters: unknown
  columns: unknown
  columnOrder: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// True for `cat:<id>` where <id> is one of the categories being deleted.
// Every other string — a static column id, an unrelated category — is kept.
function isDeletedCategoryKey(key: string, deletedIds: Set<string>): boolean {
  return (
    key.startsWith(CATEGORY_KEY_PREFIX) &&
    deletedIds.has(key.slice(CATEGORY_KEY_PREFIX.length))
  )
}

// Drop object entries whose key matches, preserving insertion order.
function omitKeys(
  obj: Record<string, unknown>,
  matches: (key: string) => boolean
): { value: Record<string, unknown>; changed: boolean } {
  const entries = Object.entries(obj).filter(([k]) => !matches(k))
  return {
    value: Object.fromEntries(entries),
    changed: entries.length !== Object.keys(obj).length,
  }
}

/**
 * Strips every reference to the given rating categories out of one preset's
 * view config: `cat:<id>` sort keys, `cat:<id>` column visibility entries and
 * column-order positions, and `filters.categoryRatings[<id>]` ranges.
 *
 * Returns the rewritten fields, or `null` when the preset referenced none of
 * the deleted categories — so callers can skip the write entirely.
 */
export function purgeCategoriesFromPreset(
  preset: PresetViewFields,
  deletedCategoryIds: Set<string>
): PresetViewFields | null {
  if (deletedCategoryIds.size === 0) return null
  const isDeleted = (key: string) =>
    isDeletedCategoryKey(key, deletedCategoryIds)

  let changed = false

  // sorts: SortSpec[] — drop whole entries sorting by a deleted category.
  let sorts = preset.sorts
  if (Array.isArray(sorts)) {
    const kept = sorts.filter(
      (s) =>
        !(isPlainObject(s) && typeof s.key === 'string' && isDeleted(s.key))
    )
    if (kept.length !== sorts.length) {
      sorts = kept
      changed = true
    }
  }

  // columnOrder: ColumnId[] — drop the deleted categories' positions.
  let columnOrder = preset.columnOrder
  if (Array.isArray(columnOrder)) {
    const kept = columnOrder.filter(
      (id) => !(typeof id === 'string' && isDeleted(id))
    )
    if (kept.length !== columnOrder.length) {
      columnOrder = kept
      changed = true
    }
  }

  // columns: Record<ColumnId, boolean> — drop the deleted categories' entries.
  let columns = preset.columns
  if (isPlainObject(columns)) {
    const result = omitKeys(columns, isDeleted)
    if (result.changed) {
      columns = result.value
      changed = true
    }
  }

  // filters.categoryRatings: Record<categoryId, Range> — keyed by the bare
  // category id, without the `cat:` prefix the other three fields use.
  let filters = preset.filters
  if (isPlainObject(filters) && isPlainObject(filters.categoryRatings)) {
    const result = omitKeys(filters.categoryRatings, (id) =>
      deletedCategoryIds.has(id)
    )
    if (result.changed) {
      filters = { ...filters, categoryRatings: result.value }
      changed = true
    }
  }

  return changed ? { sorts, filters, columns, columnOrder } : null
}
