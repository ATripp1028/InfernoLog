// Client for the AREDL (All Rated Extreme Demons List) API — the source of a
// level's list position, its EDEL enjoyment rating, and the NLW spreadsheet
// tier by name.
//
// WHY DIRECTLY AND NOT THROUGH THE GLOBAL STATS VIEWER: GSV carries an AREDL
// rank and nothing else. AREDL itself also carries `edel_enjoyment` (with a
// pending flag), a verification video for every placed level, the NLW tier as a
// NAME — which is how tier 0 ("Fuck") becomes reportable rather than inferred —
// and a Legacy tier holding the levels demoted out of extreme, which is the
// only place insane demons appear on this list at all.
//
// GOLDEN RULE (same as robtop.ts / gddl.ts / globalStatsViewer.ts): AREDL being
// slow/down/erroring is an EXPECTED branch, never a blocking error. Failure
// resolves to `undefined` so the caller leaves its checkedAt alone and retries
// later; it NEVER throws.

import { sheetTierFromName } from '@infernolog/core'
import { logger } from './logger'
import { roundEnjoyment } from './enjoyment'

const AREDL_API_BASE_URL =
  process.env.AREDL_API_BASE_URL ?? 'https://api.aredl.net'

// Keep a hung AREDL request from stalling a resolve call or a sync batch.
const FETCH_TIMEOUT_MS = 5000

// The bulk list is ~840KB over ~1600 rows. It is fetched once per cron run, not
// per level, so it can afford a longer ceiling than a single-level lookup.
const LIST_TIMEOUT_MS = 15_000

/**
 * A level's AREDL record, normalized to the `levels` columns it feeds.
 *
 * `position` is never null for a level that IS on the list — see
 * {@link AredlListEntry.status} for why it must never be rendered as a rank
 * without consulting the status first.
 */
export interface AredlResult {
  position: number | null
  /** "MainList" | "Legacy" — see {@link AredlListEntry.status}. */
  status: string | null
  /**
   * EDEL enjoyment, 0-100 to two decimal places. Null when EDEL has no settled
   * score — no rating yet, or one it still marks provisional.
   */
  enjoyment: number | null
  /** NLW spreadsheet tier, resolved from AREDL's tier NAME. */
  sheetTier: number | null
  /** Verification video, normalized to a canonical watch URL. */
  showcaseUrl: string | null
}

/**
 * One row of the bulk list. Identical to {@link AredlResult} minus the
 * showcase, which the bulk endpoint does not carry, plus the level id the row
 * is keyed by.
 *
 * ⚠️ `status` IS LOAD-BEARING, NOT DECORATION. AREDL appends its Legacy tier to
 * the end of the position sequence rather than interleaving it: MainList runs
 * 1-1573 and Legacy 1574-1606. A Legacy level's `position` is therefore NOT a
 * rank, and rendering it as "#1574" states something false. Any display of
 * `position` must check `status` first.
 */
export interface AredlListEntry {
  levelId: string
  position: number | null
  status: string | null
  enjoyment: number | null
  sheetTier: number | null
}

// Only the fields we persist are typed; the rest of the payload (points, tags,
// description, song, publisher, requires_raw_footage, …) is ignored.
interface AredlLevelRaw {
  level_id?: unknown
  position?: unknown
  status?: unknown
  edel_enjoyment?: unknown
  is_edel_pending?: unknown
  nlw_tier?: unknown
  verifications?: unknown
}

interface AredlVerificationRaw {
  video_url?: unknown
  hide_video?: unknown
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null

// The showcase AREDL is willing to show. `hide_video` is a per-verification
// opt-out, and a level can carry more than one verification, so this takes the
// first that isn't hidden rather than assuming index 0 is usable.
function verificationUrl(raw: AredlLevelRaw): string | null {
  if (!Array.isArray(raw.verifications)) return null
  for (const entry of raw.verifications as AredlVerificationRaw[]) {
    if (entry?.hide_video === true) continue
    const url = str(entry?.video_url)
    if (url) return url
  }
  return null
}

// EDEL's score, if it is a settled one.
//
// EDEL marks a score it is still collecting with `is_edel_pending`, and sends
// the provisional number regardless. Rather than store that flag beside the
// number, a provisional score is stored as NO score: null already means "EDEL
// has nothing settled for this level", and a second column would only repeat
// it. Settled scores are rounded to the two decimals EDEL itself displays.
function settledEnjoyment(raw: AredlLevelRaw): number | null {
  if (raw.is_edel_pending === true) return null
  const value = num(raw.edel_enjoyment)
  return value === null ? null : roundEnjoyment(value)
}

// The fields shared by the per-level and bulk payloads.
function normalizeCommon(raw: AredlLevelRaw) {
  return {
    position: num(raw.position),
    status: str(raw.status),
    enjoyment: settledEnjoyment(raw),
    // AREDL reports the tier by name ("Relentless"); the cache stores the 0-21
    // index. An unrecognized name resolves to null rather than throwing — see
    // sheetTierFromName in packages/core.
    //
    // NOTE the names only span 0-14 (Fuck … Merciless): AREDL sends null for a
    // LISTWORTHY level, so it cannot be the sole source of a sheet tier. The
    // merge falls through to GSV's SHEET entry for tiers 15-21.
    sheetTier: sheetTierFromName(str(raw.nlw_tier)),
  }
}

/**
 * Fetches one level's AREDL record. Returns:
 *   - an {@link AredlResult} when AREDL has the level
 *   - null when AREDL answered 404, or answered about a DIFFERENT level (see
 *     the warning below) — a real, cacheable "checked, not placed"
 *   - undefined when the call itself failed (network/timeout/non-404 non-2xx)
 * Never throws.
 *
 * ⚠️ THE PATH SEGMENT IS RESOLVED AS EITHER A LEVEL ID OR A LIST POSITION.
 * `GET /v2/api/aredl/levels/128` does not 404 — it returns HTTP 200 for the
 * level sitting at POSITION 128, a completely different level (`level_id`
 * 132751236). Every GD level id low enough to also be a valid position is
 * therefore a live mis-identification hazard, and the response looks perfectly
 * well-formed. The `level_id` identity check below is the whole defense; do not
 * remove it, and do not assume a 200 is about the level you asked for.
 */
export async function fetchAredlLevel(
  levelId: string
): Promise<AredlResult | null | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const url = `${AREDL_API_BASE_URL}/v2/api/aredl/levels/${encodeURIComponent(levelId)}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    // AREDL's "not on the list" — an answer, not a failure, and the only
    // non-2xx safe to cache.
    if (res.status === 404) return null

    if (!res.ok) {
      logger.warn(
        { levelId, status: res.status },
        'fetchAredlLevel: non-OK response'
      )
      return undefined
    }

    const body = (await res.json()) as unknown
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      logger.warn({ levelId }, 'fetchAredlLevel: unexpected response shape')
      return undefined
    }

    const raw = body as AredlLevelRaw
    // The identity check described above. A mismatch means AREDL resolved our
    // id as a position and answered about someone else's level: as far as this
    // level is concerned, it is not on the list.
    if (num(raw.level_id) !== Number(levelId)) return null

    return { ...normalizeCommon(raw), showcaseUrl: verificationUrl(raw) }
  } catch (err) {
    logger.warn({ levelId, err }, 'fetchAredlLevel: request failed')
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetches the ENTIRE AREDL in one request, keyed by level id.
 *
 * The list is ~1600 levels. Polling it one level at a time through a
 * 200-level-per-6-hours rotation would take days to notice a change that this
 * single request sees immediately — and a removal from the list is invisible to
 * per-level polling altogether, since a level that has dropped off simply 404s
 * whenever its turn eventually comes round. So the sync uses this as both a
 * bulk refresh and a membership oracle, and the per-level call above is left to
 * do what this cannot: fetch a showcase.
 *
 * Returns undefined on any failure — the caller skips its AREDL pass for that
 * run rather than concluding the list is empty and clearing 1600 levels.
 *
 * @returns A map from level id to that level's row, or undefined on failure.
 */
export async function fetchAredlList(): Promise<
  Map<string, AredlListEntry> | undefined
> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)

  try {
    const res = await fetch(`${AREDL_API_BASE_URL}/v2/api/aredl/levels`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, 'fetchAredlList: non-OK response')
      return undefined
    }

    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) {
      logger.warn('fetchAredlList: unexpected response shape')
      return undefined
    }

    const map = new Map<string, AredlListEntry>()
    for (const item of body as AredlLevelRaw[]) {
      const id = num(item?.level_id)
      if (id === null) continue
      const key = String(id)
      const entry: AredlListEntry = { levelId: key, ...normalizeCommon(item) }

      // A level id can appear TWICE — a two-player level is listed once per
      // mode (DICHOTOMY (2P) and DICHOTOMY (Solo) share 103011600), and both
      // rows carry the same level id with different positions. Prefer the
      // MainList row, then the better position, so the winner is deterministic
      // rather than whichever the payload happened to order last.
      const existing = map.get(key)
      if (existing && !betterEntry(entry, existing)) continue
      map.set(key, entry)
    }
    return map
  } catch (err) {
    logger.warn({ err }, 'fetchAredlList: request failed')
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

// Whether `candidate` should replace `current` as the row for a duplicated
// level id: a MainList placement beats any other status, and within the same
// status the stronger (lower) position wins.
function betterEntry(
  candidate: AredlListEntry,
  current: AredlListEntry
): boolean {
  const mainList = (e: AredlListEntry) => e.status === 'MainList'
  if (mainList(candidate) !== mainList(current)) return mainList(candidate)
  if (candidate.position === null) return false
  if (current.position === null) return true
  return candidate.position < current.position
}
