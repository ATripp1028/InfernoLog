// Builds the /me/import/start payload: the flat, stably-indexed row list plus
// the ranking / collections / ratings sections, with every resolution the user
// made in the wizard already folded in. Pure — the wizard hook calls this and
// sends the result.

import type { ImportCommitRow, ImportRowConflict } from '@/lib/api/import'
import type {
  ParseResult,
  ParsedCompletionRow,
  ParsedProgressRow,
  ParsedDroppedRow,
} from './parseSpreadsheet'
import {
  RANKING_MERGE_KEY,
  classifyCollectionName,
  getValidRatingRows,
  type RowResolutions,
} from './importWizardModel'

/**
 * Everything {@link buildImportPayload} needs: the parsed rows plus every resolution the user made.
 */
export interface BuildImportPayloadInput {
  completions: ParsedCompletionRow[]
  progressRows: ParsedProgressRow[]
  dropped: ParsedDroppedRow[]
  resolutions: RowResolutions
  // Collection name (or RANKING_MERGE_KEY) → the user-merged final order, for
  // whichever lists went through resolve-lists. A list not in this map never
  // needed merging — its original sheet rows are sent unchanged.
  listOrders: Map<string, string[]>
  // Passed in rather than read from wizard state: the blanket-override path
  // commits in the same tick it sets these, before React re-renders.
  progressConflictsForCommit: ImportRowConflict[]
  droppedConflictsForCommit: ImportRowConflict[]
  parseResult: ParseResult | null
}

/**
 * Turns the parsed workbook and the user's conflict resolutions into the
 * /start request body.
 *
 * Pure, and the natural first target for a test — it was ~170 lines inside an
 * async callback before the wizard was split up.
 */
export function buildImportPayload({
  completions,
  progressRows,
  dropped,
  resolutions,
  listOrders,
  progressConflictsForCommit,
  droppedConflictsForCommit,
  parseResult,
}: BuildImportPayloadInput) {
  // A resolved progress/dropped conflict must fold the matched entry's id
  // back onto progressId/dropId so the server's ordinary id round-trip
  // path (not the derived-key fallback) picks up the resolution.
  const progressMatchedIds = new Map(
    progressConflictsForCommit.map((c) => [c.rowIndex, c.matchedId])
  )
  const droppedMatchedIds = new Map(
    droppedConflictsForCommit.map((c) => [c.rowIndex, c.matchedId])
  )

  // Build the flat row list with stable indices.
  const rows: ImportCommitRow[] = [
    ...completions.map((r): ImportCommitRow => {
      // Resolved during resolve-conflicts, keyed by rowIndex (levelId
      // isn't unique enough on its own once name-only rows are involved).
      const resolved = resolutions.completion.get(String(r.rowIndex))
      return resolved
        ? {
            type: 'completion',
            rowIndex: r.rowIndex,
            // `values` only carries fields whose winner wasn't "imported"
            // — those already hold the correct value in r.data.
            data: { ...r.data, ...resolved.values },
            resolution: resolved.resolution,
          }
        : { type: 'completion', rowIndex: r.rowIndex, data: r.data }
    }),
    ...dropped.map((r): ImportCommitRow => {
      const resolved = resolutions.dropped.get(String(r.rowIndex))
      if (!resolved) {
        return {
          type: 'dropped',
          rowIndex: r.rowIndex + 100000, // offset to avoid collision with completion indices
          data: r.data,
        }
      }
      const matchedId = droppedMatchedIds.get(r.rowIndex)
      return {
        type: 'dropped',
        rowIndex: r.rowIndex + 100000,
        data: {
          ...r.data,
          ...resolved.values,
          ...(matchedId ? { dropId: matchedId } : {}),
        },
        resolution: resolved.resolution,
      }
    }),
    ...progressRows.map((r): ImportCommitRow => {
      const resolved = resolutions.progress.get(String(r.rowIndex))
      if (!resolved) {
        return {
          type: 'progress',
          rowIndex: r.rowIndex + 200000, // offset to avoid collision with completion/dropped indices
          data: r.data,
        }
      }
      const matchedId = progressMatchedIds.get(r.rowIndex)
      return {
        type: 'progress',
        rowIndex: r.rowIndex + 200000,
        data: {
          ...r.data,
          ...resolved.values,
          ...(matchedId ? { progressId: matchedId } : {}),
        },
        resolution: resolved.resolution,
      }
    }),
  ]

  // Ranking: the resolved merge order (if resolve-lists produced one)
  // wins outright — it already represents the user's final say — else
  // fall back to the sheet's own rows unchanged (no merge was needed).
  const resolvedRankingOrder = listOrders.get(RANKING_MERGE_KEY)
  const rankingEntries = resolvedRankingOrder
    ? resolvedRankingOrder.map((levelId) => ({
        levelId,
        levelName: null as string | null,
      }))
    : (parseResult?.ranking ?? [])
        .filter(
          (r) =>
            !r.flags.some((f) => f.severity === 'error') &&
            (r.levelId || r.levelName)
        )
        .map((r) => ({ levelId: r.levelId, levelName: r.levelName }))

  // The rating order gets the same treatment, from its own tab. No merge board
  // for it yet, so it is always the sheet's rows: a Ranking tab replaces the
  // stored order outright, which is the documented "sheet wins" rule.
  const ratingRankingEntries = (parseResult?.ratingRanking ?? [])
    .filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.levelId || r.levelName)
    )
    .map((r) => ({ levelId: r.levelId, levelName: r.levelName }))

  // Lists/Collections: same idea, but per-collection — a sheet can touch
  // several collections and only some of them needed merging. Rows for a
  // collection with a resolved order are dropped from the original sheet
  // rows and replaced by the resolved order's synthesized rows.
  const resolvedCollectionNames = new Set(
    [...listOrders.keys()].filter((k) => k !== RANKING_MERGE_KEY)
  )
  const untouchedListRows = (parseResult?.lists ?? [])
    .filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        r.list &&
        (r.levelId || r.levelName) &&
        !resolvedCollectionNames.has(classifyCollectionName(r.list!))
    )
    .map((r) => ({
      list: r.list as string,
      levelId: r.levelId,
      levelName: r.levelName,
      creator: r.creator,
      inGameDifficulty: r.inGameDifficulty,
      position: r.position,
    }))
  const resolvedListEntries = [...listOrders.entries()]
    .filter(([key]) => key !== RANKING_MERGE_KEY)
    .flatMap(([listName, order]) =>
      order.map((levelId, i) => ({
        list: listName,
        levelId,
        levelName: null as string | null,
        creator: null as string | null,
        inGameDifficulty: null as string | null,
        position: i,
      }))
    )
  const listEntries = [...untouchedListRows, ...resolvedListEntries]
  // Apply resolved rating conflicts before sending: 'drop' removes that
  // one category from this level's scores (leaving the existing value
  // untouched); a resolved 'score' override replaces it; everything else
  // (no resolution — never conflicted, or resolution left at "imported")
  // passes through as originally parsed. A row a drop leaves with no
  // categories left is dropped entirely — nothing left to send.
  const ratingRows = getValidRatingRows(parseResult)
    .map((r) => {
      if (!r.levelId || resolutions.rating.size === 0) return r
      const scores = { ...r.scores }
      for (const categoryName of Object.keys(r.scores)) {
        const resolved = resolutions.rating.get(`${r.levelId}::${categoryName}`)
        if (!resolved) continue
        if (resolved.resolution === 'drop') {
          delete scores[categoryName]
        } else if (typeof resolved.values.score === 'number') {
          scores[categoryName] = resolved.values.score
        }
      }
      return { ...r, scores }
    })
    .filter((r) => Object.keys(r.scores).length > 0)

  return {
    rows,
    ...(rankingEntries.length > 0 ? { ranking: rankingEntries } : {}),
    ...(ratingRankingEntries.length > 0
      ? { ratingRanking: ratingRankingEntries }
      : {}),
    ...(listEntries.length > 0 ? { collections: listEntries } : {}),
    ...(ratingRows.length > 0
      ? {
          ratings: ratingRows.map((r) => ({
            levelId: r.levelId,
            levelName: r.levelName,
            creator: r.creator,
            simpleRating: r.simpleRating,
            inGameDifficulty: r.inGameDifficulty,
            scores: r.scores,
          })),
        }
      : {}),
  }
}
