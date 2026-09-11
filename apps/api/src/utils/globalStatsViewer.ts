// Client for the Global Stats Viewer (GSV) API — a community aggregator that
// returns, in one call, a level's placements on the three community difficulty
// lists (GDDL tier, AREDL rank, and the NLW/LW spreadsheet tier), its showcase
// video, its length in seconds, and an object count that is accurate where
// RobTop's is not.
//
// WHY GSV WHEN WE ALSO CALL GDDL AND AREDL DIRECTLY: GSV is the only source for
// the object count, and it is the fallback for everything the other two carry.
// getGJLevels21 reports 65535 for any level over the in-game object limit and
// 0/null for older levels, so RobTop's key 45 cannot be shown to a user as-is.
// GSV also reaches levels the other two do not: its coverage is every RATED
// level, where GDDL is demons only and AREDL is ~1600 extremes. The per-source
// priority table lives in services/levels/communitySync.ts. See
// EXTERNAL_APIS.md.
//
// GOLDEN RULE (same as robtop.ts / gddl.ts / songFileHub.ts): GSV being
// slow/down/erroring is an EXPECTED branch, never a blocking error. Failure
// resolves to `undefined` so the merge treats GSV as having no opinion and
// the level is re-checked later; it NEVER throws.

import { logger } from './logger'
import { roundGddlTier } from './gddl'

const GSV_API_BASE_URL =
  process.env.GSV_API_BASE_URL ?? 'https://api.globalstatsviewer.com'

// Keep a hung GSV request from stalling a resolve call or a sync batch.
const FETCH_TIMEOUT_MS = 5000

/**
 * A level's GSV record, normalized to the `levels` columns it feeds. Every
 * field is independently nullable: GSV indexes the level but that says nothing
 * about which lists it appears on, whether it has a showcase, or whether an
 * object count is known.
 *
 * `sheetTier` is the NLW/LW spreadsheet tier, 0–21. **Tier 0 is a real tier**
 * ("Fuck" — a skillset too niche to rank reliably, NOT "easier than Beginner"),
 * so every guard on it must be `!= null` and never a truthiness check. GSV's
 * SHEET values run 1–21 and never 0, so a tier-0 level simply looks unplaced
 * here; AREDL is what reports that tier by name, and the merge prefers it.
 */
export interface GlobalStatsViewerResult {
  gddlTier: number | null
  aredlRank: number | null
  sheetTier: number | null
  showcaseUrl: string | null
  objectCount: number | null
  /** Level duration in whole seconds. GSV reports this pre-rounded. */
  durationSeconds: number | null
}

// One entry of additional_info.lists. `value` is the placement: a rank for
// AREDL, a 0–21 tier for SHEET, a decimal tier for GDDL.
interface GsvListRaw {
  name?: unknown
  value?: unknown
}

// Only the fields we persist are typed; the rest of the payload (rating,
// difficulty, song_info, daily_id, …) is ignored.
interface GsvLevelRaw {
  showcase_url?: unknown
  length?: { seconds?: unknown } | null
  stats?: { object_count?: unknown } | null
  additional_info?: { lists?: unknown } | null
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null

// The placement on one named list, or null when the level isn't on it. GSV
// omits the entry entirely rather than sending a null value, so a missing name
// and an unusable value both mean "not placed".
function listValue(lists: GsvListRaw[], name: string): number | null {
  const entry = lists.find((l) => l.name === name)
  return entry ? num(entry.value) : null
}

function normalize(raw: GsvLevelRaw): GlobalStatsViewerResult {
  const lists = Array.isArray(raw.additional_info?.lists)
    ? (raw.additional_info.lists as GsvListRaw[])
    : []

  // GDDL exposes decimals (39.0, 23.98); the whole number is canonical — the
  // same ingestion rule the per-user tier lookup follows. See gddl.ts.
  const gddlRaw = listValue(lists, 'GDDL')
  const sheetRaw = listValue(lists, 'SHEET')
  const aredlRaw = listValue(lists, 'AREDL')

  return {
    gddlTier: gddlRaw === null ? null : roundGddlTier(gddlRaw),
    aredlRank: aredlRaw === null ? null : Math.round(aredlRaw),
    // Rounded rather than trusted raw: the sheet tier is an integer index into
    // the tier-name table, and a non-integer would break that lookup.
    sheetTier: sheetRaw === null ? null : Math.round(sheetRaw),
    showcaseUrl: str(raw.showcase_url),
    objectCount: num(raw.stats?.object_count),
    durationSeconds: num(raw.length?.seconds),
  }
}

/**
 * Fetches a level's record from the Global Stats Viewer. Returns:
 *   - a GlobalStatsViewerResult when GSV has the level
 *   - null when GSV answered 404 — it doesn't index this level (it carries
 *     rated levels only). A real, cacheable "checked, not indexed".
 *   - undefined when the call itself failed (network/timeout/non-404 non-2xx)
 *     — the merge must treat this as NO OPINION, not as an empty record
 * Never throws.
 */
export async function fetchGlobalStatsViewerLevel(
  levelId: string
): Promise<GlobalStatsViewerResult | null | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const url = `${GSV_API_BASE_URL}/v3/levels/${encodeURIComponent(levelId)}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    // 404 is GSV's "I don't have this level" — an answer, not a failure, and
    // the only non-2xx that is safe to cache.
    if (res.status === 404) return null

    if (!res.ok) {
      // Genuine failure (down/rate-limited/5xx). Warn (not error): expected
      // branch, same philosophy as RobTop/GDDL/SFH unavailability.
      logger.warn(
        { levelId, status: res.status },
        'fetchGlobalStatsViewerLevel: non-OK response'
      )
      return undefined
    }

    const body = (await res.json()) as unknown
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      // Unexpected shape — treat as a failure (retry later), not a cacheable
      // "not indexed".
      logger.warn(
        { levelId },
        'fetchGlobalStatsViewerLevel: unexpected response shape'
      )
      return undefined
    }

    return normalize(body as GsvLevelRaw)
  } catch (err) {
    // Network error, timeout/abort, or JSON parse failure — the merge leaves
    // GSV's columns alone and the sync job retries. Warn so a persistent
    // failure is diagnosable, but never throw to the caller.
    logger.warn({ levelId, err }, 'fetchGlobalStatsViewerLevel: request failed')
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}
