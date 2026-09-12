// Parsing for the level-browse query string, shared by every endpoint that
// browses the levels cache with the /search filter set: GET /v1/levels/browse,
// the filter-forwarding GET /v1/levels/gd-search, and a collection's
// GET /v1/me/collections/:collectionId/levels.

import { LEVEL_RANGE_FIELDS, LevelBrowseQuerySchema } from '@infernolog/core'

/**
 * Parses and validates a browse query string: arrays as repeated params,
 * booleans as "true"/"false", coin counts and range bounds as numbers.
 *
 * @param sp - The request's search params.
 * @returns The core schema's safeParse result — a failure is the caller's 400.
 */
export function parseBrowseQuery(sp: URLSearchParams) {
  const parseBool = (key: string): boolean | undefined => {
    const v = sp.get(key)
    if (v === 'true') return true
    if (v === 'false') return false
    return undefined
  }
  const arr = (key: string): string[] | undefined => {
    const v = sp.getAll(key)
    return v.length > 0 ? v : undefined
  }
  // An empty param is absent, not zero (Number('') is 0). Anything else that
  // isn't numeric becomes NaN, which the schema rejects with a 400.
  const num = (key: string): number | undefined => {
    const v = sp.get(key)
    return v === null || v.trim() === '' ? undefined : Number(v)
  }
  const ranges = Object.fromEntries(
    LEVEL_RANGE_FIELDS.flatMap((f) => [
      [`${f}Min`, num(`${f}Min`)],
      [`${f}Max`, num(`${f}Max`)],
    ])
  )
  return LevelBrowseQuerySchema.safeParse({
    ...ranges,
    q: sp.get('q') ?? undefined,
    searchBy: sp.get('searchBy') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    sortDir: sp.get('sortDir') ?? undefined,
    cursor: sp.get('cursor') ?? undefined,
    difficulty: arr('difficulty'),
    rateStatus: arr('rateStatus'),
    twoPlayer: parseBool('twoPlayer'),
    coinCount: sp.getAll('coinCount').length
      ? sp.getAll('coinCount').map(Number)
      : undefined,
    coinsVerified: parseBool('coinsVerified'),
    length: arr('length'),
    levelType: sp.get('levelType') ?? undefined,
    songType: sp.get('songType') ?? undefined,
    sheetTier: num('sheetTier'),
  })
}
