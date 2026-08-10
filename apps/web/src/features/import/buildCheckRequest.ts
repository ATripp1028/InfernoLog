// Builds the /me/import/check request body from the parsed sheet: the same
// "which rows are actually importable" filter the final commit uses, mapped
// into the shape the endpoint takes. Pure — the flow calls this and sends the
// result.
//
// Sibling of buildImportPayload, which does the same job for /import/start.

import type { ParseResult } from './parseSpreadsheet'
import type {
  ParsedCompletionRow,
  ParsedProgressRow,
  ParsedDroppedRow,
} from './parseSpreadsheet'
import { getValidRatingRows } from './importWizardModel'

export interface CheckRequestInput {
  parseResult: ParseResult
  completions: ParsedCompletionRow[]
  progressRows: ParsedProgressRow[]
  dropped: ParsedDroppedRow[]
}

export function buildCheckRequest({
  parseResult,
  completions,
  progressRows,
  dropped,
}: CheckRequestInput) {
  const ratingRows = getValidRatingRows(parseResult)
  const rankingRows = (parseResult.ranking ?? []).filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') && (r.levelId || r.levelName)
  )
  const listRows = (parseResult.lists ?? []).filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') &&
      r.list &&
      (r.levelId || r.levelName)
  )

  const request = {
    completions: completions.map((r) => ({
      rowIndex: r.rowIndex,
      data: r.data,
    })),
    dropped: dropped.map((r) => ({
      rowIndex: r.rowIndex,
      data: r.data,
    })),
    progress: progressRows.map((r) => ({
      rowIndex: r.rowIndex,
      data: r.data,
    })),
    ratings: ratingRows.map((r) => ({
      levelId: r.levelId,
      levelName: r.levelName,
      creator: r.creator,
      inGameDifficulty: r.inGameDifficulty,
      scores: r.scores,
    })),
    ranking: rankingRows.map((r) => ({
      levelId: r.levelId,
      levelName: r.levelName,
    })),
    collections: listRows.map((r) => ({
      list: r.list as string,
      levelId: r.levelId,
      levelName: r.levelName,
      creator: r.creator,
      inGameDifficulty: r.inGameDifficulty,
      position: r.position,
    })),
  }

  return {
    request,
    // Nothing to check when the sheet produced no importable rows at all —
    // the caller skips the round trip and uses EMPTY_CHECK_RESULT.
    hasRows:
      completions.length > 0 ||
      dropped.length > 0 ||
      progressRows.length > 0 ||
      ratingRows.length > 0 ||
      rankingRows.length > 0 ||
      listRows.length > 0,
  }
}
