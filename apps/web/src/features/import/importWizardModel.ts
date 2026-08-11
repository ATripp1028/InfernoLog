// Shared model for the spreadsheet import wizard: the step vocabulary, the
// per-tab resolution shapes, and the pure transforms that turn a /check
// response into the groups the resolvers render (or, in blanket-override
// mode, straight into resolutions).

import type {
  ImportRowConflict,
  ImportRatingConflict,
  ImportListMerge,
  ImportCheckResponse,
} from '@/lib/api/import'
import type { GroupResolution } from './FieldConflictMerge'
import type {
  DateFormat,
  ParseResult,
  ParseFlag,
  ParsedRatingRow,
} from './parseSpreadsheet'

/**
 * checking-conflicts is a distinct state from committing (see StepIndicator's
 * ORDER map) — it's the network round trip that decides where the wizard
 * goes next, so it must sit between review and resolve-conflicts/resolve-lists,
 * never share committing's step slot.
 */
export type WizardStep =
  | 'upload'
  | 'review'
  | 'checking-conflicts'
  | 'resolve-conflicts'
  | 'resolve-lists'
  | 'committing'
  | 'success'

/**
 * The resolve-conflicts step's internal sequence — a sub-step is skipped
 * when its conflict list is empty, same "skip what's empty" rule as the
 * top-level wizard steps.
 */
export const CONFLICT_SUB_STEP_ORDER = [
  'completions',
  'progress',
  'dropped',
  'ratings',
] as const
/**
 * One sub-step of the resolve-conflicts step. See {@link CONFLICT_SUB_STEP_ORDER}.
 */
export type ConflictSubStep = (typeof CONFLICT_SUB_STEP_ORDER)[number]

/**
 * The four per-tab resolution maps, keyed by tab rather than passed as
 * separate same-typed positional arguments — every one of these is a
 * Map<string, GroupResolution>, so positional params gave TypeScript nothing
 * to catch a caller accidentally swapping two of them (e.g. passing
 * `dropped` where `progress` belongs) — a keyed object makes a swap
 * self-evident at the call site instead of a silent data-corruption bug.
 */
export interface RowResolutions {
  completion: Map<string, GroupResolution>
  progress: Map<string, GroupResolution>
  dropped: Map<string, GroupResolution>
  rating: Map<string, GroupResolution>
}

/**
 * A fresh, empty per-tab resolution map. Keyed by tab so a mis-keyed write cannot silently land in the wrong one.
 */
export const EMPTY_ROW_RESOLUTIONS: RowResolutions = {
  completion: new Map(),
  progress: new Map(),
  dropped: new Map(),
  rating: new Map(),
}

/**
 * resolvedListOrders key for the single global ranking merge (once Phase 5
 * populates rankingMerge) — collections are keyed by their own display name,
 * which can never collide with this sentinel.
 */
export const RANKING_MERGE_KEY = '__ranking__'

/**
 * Mirrors apps/api/src/services/importCollections.ts's classifyCollection —
 * only the display-name half, since the wizard just needs to know which raw
 * sheet rows belong to the same target collection as an already-resolved
 * merge result (matched against ImportListMerge.list), not the full
 * key/type/create-on-demand logic the backend owns.
 */
export function classifyCollectionName(raw: string): string {
  const k = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (k === 'wanttobeat') return 'Want to Beat'
  if (['favorites', 'favourites', 'favorite', 'favourite'].includes(k))
    return 'Favorites'
  if (
    [
      'leastfavorites',
      'leastfavourites',
      'leastfavorite',
      'leastfavourite',
    ].includes(k)
  )
    return 'Least Favorites'
  return raw.trim()
}

/**
 * checkConflicts is skipped entirely when there's nothing to check (e.g. an
 * import with no Completions/Progress/Dropped rows at all).
 */
export const EMPTY_CHECK_RESULT: ImportCheckResponse = {
  completionConflicts: [],
  progressConflicts: [],
  progressDuplicates: [],
  droppedConflicts: [],
  droppedDuplicates: [],
  ratingConflicts: [],
  collectionsMerge: [],
  rankingMerge: null,
}

/**
 * Shared shape between Completions/Progress/Dropped conflicts — FieldConflictMerge
 * only needs the group scaffolding, not the levelId/matchedId bookkeeping.
 */
export function conflictsToGroups(conflicts: ImportRowConflict[]) {
  return conflicts.map((c) => ({
    groupId: String(c.rowIndex),
    title: c.levelName ?? `Level ${c.levelId}`,
    subtitle: `ID ${c.levelId}`,
    fields: c.fields.map((f) => ({
      field: f.field,
      existingValue: f.existingValue,
      importedValue: f.importedValue,
    })),
  }))
}

/**
 * Ratings conflicts are keyed by (levelId, categoryName) rather than
 * rowIndex — a rating "row" in the sheet bundles every category for one
 * level into a single scores map, so a conflict on one category doesn't
 * correspond to a whole row the way it does for the other three tabs.
 */
export function ratingConflictGroupId(conflict: ImportRatingConflict): string {
  return `${conflict.levelId}::${conflict.categoryName}`
}

/**
 * Turns the /check response's rating conflicts into the group shape the field resolver renders.
 */
export function ratingConflictsToGroups(conflicts: ImportRatingConflict[]) {
  return conflicts.map((c) => ({
    groupId: ratingConflictGroupId(c),
    title: c.levelName ?? `Level ${c.levelId}`,
    subtitle: c.categoryName,
    fields: [
      {
        field: 'score',
        existingValue: c.existingScore,
        importedValue: c.importedScore,
      },
    ],
  }))
}

/**
 * Blanket-override mode ("imported data always wins"): synthesizes the exact
 * same resolutions a user would produce by clicking "Use imported for all" on
 * every conflict step and "Use spreadsheet order" on every list merge board —
 * reusing the established resolution vocabulary instead of a separate commit
 * path, so the backend sees no difference between this and a manually
 * resolved import.
 */
export function overwriteRowResolutions(
  conflicts: ImportRowConflict[]
): Map<string, GroupResolution> {
  return new Map(
    conflicts.map((c) => [
      String(c.rowIndex),
      { resolution: 'overwrite' as const, values: {} },
    ])
  )
}

/**
 * Resolves every rating conflict to the imported value — the blanket-override path, which skips the resolver entirely.
 */
export function overwriteRatingResolutions(
  conflicts: ImportRatingConflict[]
): Map<string, GroupResolution> {
  return new Map(
    conflicts.map((c) => [
      ratingConflictGroupId(c),
      { resolution: 'overwrite' as const, values: {} },
    ])
  )
}

/**
 * Resolves every list merge to the spreadsheet's order — the blanket-override path for Ranking and collections.
 */
export function overwriteListOrders(
  collectionsMerge: ImportListMerge[],
  rankingMerge: ImportListMerge | null
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const m of collectionsMerge) {
    map.set(
      m.list!,
      m.importedOrder.map((e) => e.levelId)
    )
  }
  if (rankingMerge) {
    map.set(
      RANKING_MERGE_KEY,
      rankingMerge.importedOrder.map((e) => e.levelId)
    )
  }
  return map
}

/**
 * Shared between the /check request and the final /start payload — both need
 * the same "which rating rows are actually importable" filter.
 */
export function getValidRatingRows(
  parseResult: ParseResult | null
): ParsedRatingRow[] {
  return (parseResult?.ratings ?? []).filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') &&
      (r.levelId || r.levelName) &&
      Object.keys(r.scores).length > 0
  )
}

/**
 * The spreadsheet tabs that carry rows, in the order the review step lists
 * them. Anything iterating tabs — grouping flags, rendering per-tab
 * breakdowns — reads this rather than re-typing the six names; the review
 * step used to enumerate them by hand in six places.
 */
export const FLAG_TABS = [
  { key: 'completions', label: 'Completions tab' },
  { key: 'progress', label: 'Progress tab' },
  { key: 'dropped', label: 'Dropped tab' },
  { key: 'ranking', label: 'Ranking tab' },
  { key: 'lists', label: 'Lists tab' },
  { key: 'ratings', label: 'Ratings tab' },
] as const

/** One of {@link FLAG_TABS}' keys. */
export type FlagTab = (typeof FLAG_TABS)[number]['key']

/** Flags grouped by the tab they came from. */
export type FlagsByTab = Record<FlagTab, ParseFlag[]>

/**
 * Every parse flag from every tab, plus the cross-row duplicate report.
 *
 * `duplicates` is deliberately not a {@link FlagTab} — it is a whole-workbook
 * finding rather than a per-row flag, so it never appears in a per-tab
 * breakdown.
 */
export interface AllFlags extends FlagsByTab {
  duplicates: ParseResult['duplicateLevelIds']
}

/**
 * The date-format choices offered on upload. The parser cannot infer the format, so the user states it.
 */
export const DATE_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'MDY', label: 'MM/DD/YYYY (US)' },
  { value: 'DMY', label: 'DD/MM/YYYY (International)' },
  { value: 'ISO', label: 'YYYY-MM-DD (ISO dashes)' },
  { value: 'YMD', label: 'YYYY/MM/DD (ISO slashes)' },
]

/**
 * Display position of each step in StepIndicator. checking-conflicts shares
 * the "Conflicts" slot with resolve-conflicts itself — it's the in-flight
 * check that decides whether the resolve step is needed at all, so it must
 * render as the same indicator position rather than briefly flashing
 * "Import" as current before possibly stepping back. resolve-lists gets its
 * own slot: it's reachable either directly from checking-conflicts (no field
 * conflicts, but a list merge is needed) or after resolve-conflicts
 * finishes — both are forward moves since its order (3) is greater than
 * checking-conflicts/resolve-conflicts's (2).
 */
export const STEP_ORDER: Record<WizardStep | 'done', number> = {
  upload: 0,
  review: 1,
  'checking-conflicts': 2,
  'resolve-conflicts': 2,
  'resolve-lists': 3,
  committing: 4,
  success: 5,
  done: 6,
}

/**
 * First non-empty sub-step in CONFLICT_SUB_STEP_ORDER, or null when every
 * conflict list is empty — i.e. the check found nothing to resolve by hand.
 */
export function firstConflictSubStep(
  completion: ImportRowConflict[],
  progress: ImportRowConflict[],
  dropped: ImportRowConflict[],
  ratings: ImportRatingConflict[]
): ConflictSubStep | null {
  if (completion.length > 0) return 'completions'
  if (progress.length > 0) return 'progress'
  if (dropped.length > 0) return 'dropped'
  if (ratings.length > 0) return 'ratings'
  return null
}
