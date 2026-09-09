// Client for the Global Stats Viewer (GSV) API — a community aggregator that
// returns, in one call, a level's placements on the three community difficulty
// lists (GDDL tier, AREDL rank, and the NLW/LW spreadsheet tier), its showcase
// video, and an object count that is accurate where RobTop's is not.
//
// WHY GSV RATHER THAN EACH LIST'S OWN API: one request covers all three lists,
// and GSV's object count is the reliable one. getGJLevels21 reports 65535 for
// any level over the in-game object limit and 0/null for older levels, so
// RobTop's key 45 cannot be shown to a user as-is. See EXTERNAL_APIS.md.
//
// GOLDEN RULE (same as robtop.ts / gddl.ts / songFileHub.ts): GSV being
// slow/down/erroring is an EXPECTED branch, never a blocking error. Failure
// resolves to `undefined` so the caller leaves `gsvCheckedAt` null and retries
// later; it NEVER throws.

import { logger } from './logger'
import { roundGddlTier } from './gddl'

const GSV_API_BASE_URL =
  process.env.GSV_API_BASE_URL ?? 'https://api.globalstatsviewer.com'

// Keep a hung GSV request from stalling a resolve call or a sync batch.
const FETCH_TIMEOUT_MS = 5000

// GSV's own difficulty scale, where 12 is Extreme Demon (11 is Insane Demon,
// 10 Hard Demon). Read from GSV's response rather than our cached RobTop
// difficulty so the whole SHEET interpretation below stays inside one payload.
const GSV_EXTREME_DEMON_DIFFICULTY = 12

// The spreadsheets' bottom tier ("Fuck"), which GSV never reports.
const SHEET_TIER_FUCK = 0

/**
 * A level's GSV record, normalized to the `levels` columns it feeds. Every
 * field is independently nullable: GSV indexes the level but that says nothing
 * about which lists it appears on, whether it has a showcase, or whether an
 * object count is known.
 *
 * `sheetTier` is the NLW/LW spreadsheet tier, 0–21. **Tier 0 is a real tier**
 * ("Fuck" — a skillset too niche to rank reliably, NOT "easier than Beginner"),
 * so every guard on it must be `!= null` and never a truthiness check. It is
 * also the one field here GSV never states outright — see
 * {@link sheetTierForMissingEntry} for how a 0 is arrived at, and why that
 * inference is wider than the tier it stands for.
 */
export interface GlobalStatsViewerResult {
  gddlTier: number | null
  aredlRank: number | null
  sheetTier: number | null
  showcaseUrl: string | null
  objectCount: number | null
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
  difficulty?: unknown
  showcase_url?: unknown
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

/**
 * What a MISSING SHEET entry means for a level.
 *
 * GSV reports sheet tiers 1-21 and **never 0** — verified across all 1805
 * extreme demons it indexes, where the value distribution runs 1 through 21 with
 * no zeroes at all. The spreadsheets' bottom "Fuck" tier is therefore invisible
 * in this payload: a tier-0 level looks identical to a level with no placement.
 * We resolve that ambiguity toward tier 0 for extreme demons, since that is the
 * only population the sheets rank in the first place.
 *
 * ⚠️ THIS IS AN ASSUMPTION, NOT SOMETHING GSV TELLS US, and it over-reaches: of
 * those 1805 extreme demons, 355 (20%) carry no SHEET entry, and the evidence
 * says most are simply unranked rather than tier 0 — their median level id is
 * 119.7M against 88.7M for placed levels, 89% are above 100M, 347 of 355 are
 * 2.2-era, and only 30% appear on AREDL versus 100% of placed levels. A level
 * the sheets have not gotten to yet will be shown as bottom tier.
 *
 * Because GSV never sends a real 0, every stored 0 came from here, so the whole
 * inference reverses with one statement and no ambiguity:
 *   UPDATE levels SET "sheetTier" = NULL WHERE "sheetTier" = 0;
 * It is also self-healing: once the sheets place a level, the next GSV check
 * overwrites the 0 with its real tier.
 */
function sheetTierForMissingEntry(raw: GsvLevelRaw): number | null {
  return num(raw.difficulty) === GSV_EXTREME_DEMON_DIFFICULTY
    ? SHEET_TIER_FUCK
    : null
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
    sheetTier:
      sheetRaw === null ? sheetTierForMissingEntry(raw) : Math.round(sheetRaw),
    showcaseUrl: str(raw.showcase_url),
    objectCount: num(raw.stats?.object_count),
  }
}

/**
 * Fetches a level's record from the Global Stats Viewer. Returns:
 *   - a GlobalStatsViewerResult when GSV has the level
 *   - null when GSV answered 404 — it doesn't index this level (it carries
 *     rated levels only). A real, cacheable "checked, not indexed".
 *   - undefined when the call itself failed (network/timeout/non-404 non-2xx)
 *     — the caller must NOT stamp gsvCheckedAt in this case
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
    // Network error, timeout/abort, or JSON parse failure — leave gsvCheckedAt
    // null so the sync job retries. Warn so a persistent failure is
    // diagnosable, but never throw to the caller.
    logger.warn({ levelId, err }, 'fetchGlobalStatsViewerLevel: request failed')
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}
