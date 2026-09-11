// Client for the GDDL (gdladder.com) API.
//
// SECURITY: the user's API key passed through here must NEVER be logged. It is
// only ever sent in the Authorization header. Do not add logging of the key or
// of request headers to this module.

import { logger } from './logger'
import { roundEnjoyment } from './enjoyment'
import { acquireGddlSlot, reportGddlThrottled } from './gddlRateLimit'

const GDDL_API_BASE_URL =
  process.env.GDDL_API_BASE_URL ?? 'https://gdladder.com/api'

// How long to wait on GDDL before giving up. Keeps a hung GDDL request from
// pinning the Lambda until its own timeout.
const VERIFY_TIMEOUT_MS = 8000

/**
 * Base class for all GDDL-side errors. The worker uses this to distinguish
 * "GDDL is misbehaving" (no Sentry, user-facing message) from "our bug" (Sentry).
 */
export class GddlError extends Error {}

/**
 * GDDL responded and explicitly rejected the key.
 */
export class GddlInvalidKeyError extends GddlError {
  constructor(message = 'GDDL rejected the API key') {
    super(message)
    this.name = 'GddlInvalidKeyError'
  }
}

/**
 * GDDL could not be reached, timed out, or returned a server error.
 */
export class GddlUnavailableError extends GddlError {
  constructor(message = 'GDDL is unavailable') {
    super(message)
    this.name = 'GddlUnavailableError'
  }
}

/**
 * Verifies an API key against GDDL's /user/me endpoint. Resolves with the
 * GDDL account name on success; throws GddlInvalidKeyError if GDDL says the key
 * is invalid; rethrows other errors (network, timeout) unchanged.
 */
export async function verifyGddlApiKey(
  apiKey: string
): Promise<{ name: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${GDDL_API_BASE_URL}/user/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  // Any non-2xx response means, as far as we can tell, the key is invalid.
  if (!res.ok) {
    throw new GddlInvalidKeyError()
  }

  const body = (await res.json()) as { Name?: unknown }
  // A valid key comes back with a Name attribute. Its absence means we can't
  // treat this as a connected account.
  if (typeof body.Name !== 'string' || body.Name.length === 0) {
    throw new GddlInvalidKeyError('GDDL response did not include a user name')
  }

  return { name: body.Name }
}

/**
 * GDDL exposes tiers as decimals (e.g. 18.43), but GDDL itself displays — and
 * treats as canonical — the tier rounded to the nearest whole number. Round at
 * every point we ingest a GDDL rating so we never store or surface the decimal.
 */
export function roundGddlTier(rating: number): number {
  return Math.round(rating)
}

/**
 * Rescales a GDDL enjoyment rating (0-10, e.g. 4.954022988505747) onto the
 * 0-100 scale EDEL reports, to two decimal places — so 4.954 becomes 49.54.
 *
 * That is the precision EDEL itself displays, and both sources share one
 * column, so a GDDL figure is stored exactly as an EDEL one would be. See
 * {@link roundEnjoyment} for the rounding and clamping.
 */
export function rescaleGddlEnjoyment(enjoyment: number): number {
  return roundEnjoyment(enjoyment * 10)
}

// How long to wait on the public GDDL level lookup before giving up. Like the
// level metadata autofill, this must never block the logging flow.
const LEVEL_TIMEOUT_MS = 5000

// A YouTube video id, which is what GDDL's `Showcase` carries — a bare id, not
// a URL. Validated rather than trusted: it is interpolated into a URL we then
// hand to the browser.
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * A level's public GDDL record, normalized to the `levels` columns it feeds.
 * Every field is independently nullable — GDDL indexing a level says nothing
 * about whether it has a showcase or a measured length.
 */
export interface GddlLevelResult {
  /** The community tier, rounded to a whole number at ingestion. */
  tier: number | null
  /**
   * Community enjoyment, rescaled from GDDL's 0-10 to the 0-100 that EDEL uses,
   * so the two are directly comparable wherever one stands in for the other.
   * See {@link rescaleGddlEnjoyment}.
   */
  enjoyment: number | null
  /** Showcase video, normalized to a canonical watch URL. */
  showcaseUrl: string | null
  /** Level duration in whole seconds. */
  seconds: number | null
  objectCount: number | null
}

// Only the fields we persist are typed; the rest of the payload (Enjoyment,
// Deviation, Popularity, the Song/Publisher sub-objects, …) is ignored.
interface GddlLevelRaw {
  ID?: unknown
  Rating?: unknown
  Enjoyment?: unknown
  Showcase?: unknown
  Meta?: { seconds?: unknown; objects?: unknown } | null
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Fetches a level's public GDDL record (no API key needed). Returns:
 *   - a {@link GddlLevelResult} when GDDL has the level
 *   - null when GDDL answered but doesn't carry it — a real, cacheable
 *     "checked, not indexed"
 *   - undefined when the call itself failed (network/timeout/non-2xx), when the
 *     shared rate limiter denied a slot, or when GDDL 429'd
 * Never throws.
 *
 * ⚠️ TWO UPSTREAM QUIRKS DECIDE THE NULL BRANCH, and both are easy to get wrong:
 *
 * 1. The endpoint is `/levels/{id}` — PLURAL. `/level/{id}` responds
 *    `404 Cannot GET` for every id on earth, which is why the tier autofill
 *    that used it returned null for its entire life without anyone noticing
 *    (every test mocks fetch).
 * 2. A level GDDL does not carry comes back as **HTTP 200 with body `{}`**, not
 *    a 404. Mapping only 404 to null would file every un-indexed level under
 *    "the call failed" and keep it permanently due for a re-check.
 *
 * GDDL echoes the level id back as `ID`, so one identity check settles both:
 * a body without a matching `ID` is a not-found, whatever the status said.
 *
 * Unlike the key-authenticated functions in this module, which throw
 * {@link GddlError} subclasses, this follows the community-source house
 * contract (see utils/globalStatsViewer.ts): failure is an expected branch and
 * resolves to a value, never an exception.
 */
export async function fetchGddlLevel(
  levelId: string
): Promise<GddlLevelResult | null | undefined> {
  // Denied means the bucket is empty or a 429 cooldown is open. Treated as a
  // failed call: no opinion, retried on a later lap. Never waits. The limiter
  // is a DB round-trip, so its own failure is the same "no opinion" — this
  // function must not throw.
  let acquired: boolean
  try {
    acquired = await acquireGddlSlot()
  } catch (err) {
    logger.warn({ levelId, err }, 'fetchGddlLevel: rate limiter unavailable')
    return undefined
  }
  if (!acquired) return undefined

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LEVEL_TIMEOUT_MS)

  try {
    const res = await fetch(
      `${GDDL_API_BASE_URL}/levels/${encodeURIComponent(levelId)}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal }
    )

    if (res.status === 429) {
      // Open the shared cooldown so every consumer backs off together, rather
      // than each path discovering the limit for itself.
      const retryAfter = Number(res.headers.get('retry-after'))
      await reportGddlThrottled(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : undefined
      )
      logger.warn({ levelId }, 'fetchGddlLevel: rate limited')
      return undefined
    }

    if (!res.ok) {
      logger.warn(
        { levelId, status: res.status },
        'fetchGddlLevel: non-OK response'
      )
      return undefined
    }

    const body = (await res.json()) as unknown
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      logger.warn({ levelId }, 'fetchGddlLevel: unexpected response shape')
      return undefined
    }

    // The identity check described above: `{}` and any mismatched id are both
    // "GDDL doesn't have this level", which is cacheable.
    const raw = body as GddlLevelRaw
    if (num(raw.ID) !== Number(levelId)) return null

    const rating = num(raw.Rating)
    const enjoyment = num(raw.Enjoyment)
    const seconds = num(raw.Meta?.seconds)
    const showcase =
      typeof raw.Showcase === 'string' && YOUTUBE_ID_RE.test(raw.Showcase)
        ? `https://www.youtube.com/watch?v=${raw.Showcase}`
        : null

    return {
      tier: rating === null ? null : roundGddlTier(rating),
      enjoyment: enjoyment === null ? null : rescaleGddlEnjoyment(enjoyment),
      showcaseUrl: showcase,
      seconds: seconds === null ? null : Math.round(seconds),
      objectCount: num(raw.Meta?.objects),
    }
  } catch (err) {
    logger.warn({ levelId, err }, 'fetchGddlLevel: request failed')
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetches GDDL's suggested tier for a level (public list data — no key needed).
 * Resolves with the numeric tier (rounded to the nearest whole number), or
 * `null` for any failure (down, timeout, not-found, malformed). Never throws.
 *
 * A thin wrapper over {@link fetchGddlLevel} so there is exactly one request
 * shape against GDDL's public API — the two used to diverge, and the one this
 * replaces was pointed at a dead endpoint.
 */
export async function fetchGddlTier(levelId: string): Promise<number | null> {
  const result = await fetchGddlLevel(levelId)
  return result ? result.tier : null
}

/**
 * Fetches the authenticated user's GDDL account info (id + name).
 * Reuses the same /user/me endpoint as verifyGddlApiKey but also extracts the
 * numeric user ID needed for the submissions endpoint.
 */
export async function fetchGddlUserInfo(
  apiKey: string
): Promise<{ id: number; name: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${GDDL_API_BASE_URL}/user/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    clearTimeout(timeout)
    throw new GddlUnavailableError('Could not reach GDDL')
  }

  if (!res.ok) {
    // 4xx = key explicitly rejected; 5xx = GDDL server error (not the key's fault).
    if (res.status >= 500)
      throw new GddlUnavailableError(`GDDL returned ${res.status}`)
    throw new GddlInvalidKeyError()
  }

  const body = (await res.json()) as { ID?: unknown; Name?: unknown }
  if (typeof body.ID !== 'number' || typeof body.Name !== 'string') {
    throw new GddlInvalidKeyError('GDDL response missing ID or Name')
  }

  return { id: body.ID, name: body.Name }
}

/** GDDL's level object as embedded in a submission. Field names are GDDL's. */
export interface GddlSubmissionLevel {
  ID: number
  Rating: number
  Enjoyment: number
  Meta: {
    Name: string
    Difficulty: string
    Length: number
    Rarity: number
    IsTwoPlayer: boolean
    Song: { Name: string }
    Publisher: { name: string } | null
  }
}

/** One record a user has submitted to GDDL. Field names are GDDL's. */
export interface GddlSubmission {
  ID: number
  Rating: number
  Enjoyment: number
  Proof: string | null
  DateAdded: string
  Level: GddlSubmissionLevel
}

/** One page of GDDL's paginated submissions endpoint. */
export interface GddlSyncResponse {
  total: number
  limit: number
  page: number
  submissions: GddlSubmission[]
}

const SUBMISSIONS_PAGE_LIMIT = 25

/**
 * Fetches all pages of the user's GDDL submission history. Throws on any
 * non-2xx page response so the caller can record partial progress.
 */
export async function fetchAllGddlSubmissions(
  apiKey: string,
  gddlUserId: number
): Promise<GddlSubmission[]> {
  const all: GddlSubmission[] = []
  let page = 0

  while (true) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(
        `${GDDL_API_BASE_URL}/user/${gddlUserId}/submissions?page=${page}&limit=${SUBMISSIONS_PAGE_LIMIT}&sort=levelID&sortDirection=asc`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)
    } catch {
      clearTimeout(timeout)
      throw new GddlUnavailableError('Could not reach GDDL')
    }

    if (!res.ok) {
      throw new GddlUnavailableError(
        `GDDL returned ${res.status} on submissions page ${page}`
      )
    }

    const body = (await res.json()) as GddlSyncResponse
    const submissions = body.submissions as GddlSubmission[] | undefined
    if (!Array.isArray(submissions)) {
      throw new GddlUnavailableError(
        `GDDL returned unexpected shape on submissions page ${page}`
      )
    }

    all.push(...submissions)
    if (submissions.length < SUBMISSIONS_PAGE_LIMIT) break
    page++
  }

  return all
}

// ─── Favorites / least-favorites list management ─────────────────────────────
// These lists are per-user and cap at 4 entries on the GDDL side.

const LIST_TIMEOUT_MS = 8000

/**
 * Fetches all level IDs currently in a GDDL user list.
 * Returns string-form GD level IDs (GDDL stores them as integers).
 */
export async function fetchGddlList(
  apiKey: string,
  gddlUserId: number,
  list: 'favorites' | 'least-favorites'
): Promise<string[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${GDDL_API_BASE_URL}/user/${gddlUserId}/${list}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    clearTimeout(timeout)
    throw new GddlUnavailableError('Could not reach GDDL')
  }

  if (!res.ok) {
    throw new GddlUnavailableError(`GDDL returned ${res.status} for ${list}`)
  }

  const body = (await res.json()) as unknown
  if (!Array.isArray(body)) return []

  return body
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null
      // GDDL uses levelID (camelCase) in most list endpoints; fall back to ID.
      const rec = item as Record<string, unknown>
      const raw = rec.levelID ?? rec.ID ?? rec.levelId
      return typeof raw === 'number' ? String(raw) : null
    })
    .filter((id): id is string => id !== null)
}

/**
 * Adds a level to a GDDL user list. The body uses `levelId` (integer).
 */
export async function addGddlListEntry(
  apiKey: string,
  gddlUserId: number,
  list: 'favorites' | 'least-favorites',
  levelId: string
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${GDDL_API_BASE_URL}/user/${gddlUserId}/${list}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ levelId: parseInt(levelId, 10) }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    clearTimeout(timeout)
    throw new GddlUnavailableError('Could not reach GDDL')
  }

  if (!res.ok) {
    throw new GddlError(
      `GDDL returned ${res.status} adding level ${levelId} to ${list}`
    )
  }
}

/**
 * Removes a level from a GDDL user list. The body uses `levelId` (integer).
 */
export async function removeGddlListEntry(
  apiKey: string,
  gddlUserId: number,
  list: 'favorites' | 'least-favorites',
  levelId: string
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${GDDL_API_BASE_URL}/user/${gddlUserId}/${list}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ levelId: parseInt(levelId, 10) }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    clearTimeout(timeout)
    throw new GddlUnavailableError('Could not reach GDDL')
  }

  if (!res.ok) {
    throw new GddlError(
      `GDDL returned ${res.status} removing level ${levelId} from ${list}`
    )
  }
}

// ─── Record submission ────────────────────────────────────────────────────────

// How long to wait on a GDDL record submission before giving up. This call is
// fire-and-forget from the completion flow; the timeout just bounds the work.
const SUBMIT_TIMEOUT_MS = 8000

/**
 * Submits a completion record to GDDL. Resolves with whether GDDL accepted the
 * record. Throws on network/timeout/non-2xx — callers MUST treat this as
 * non-blocking (the completion has already been written) and swallow failures.
 */
export async function submitGddlRecord(
  apiKey: string,
  record: {
    levelId: string
    videoUrl: string | null
    attempts: number | null
    fps: number | null
    enjoyment: number | null
    gddlTier: number | null
    isSolo?: boolean
    device?: string | null
  }
): Promise<{ accepted: boolean }> {
  // Resolve the GDDL numeric userID from the key — required by the endpoint.
  const { id: gddlUserId } = await fetchGddlUserInfo(apiKey)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS)

  const payload: Record<string, unknown> = {
    levelID: parseInt(record.levelId, 10),
    userID: gddlUserId,
    isProofPrivate: false,
    progress: 100,
    isSolo: record.isSolo ?? true,
    device: record.device ?? 'pc',
    status: 'beaten',
  }
  if (record.attempts != null) payload.attempts = record.attempts
  if (record.fps != null) payload.refreshRate = record.fps
  if (record.enjoyment != null)
    payload.enjoyment = Math.round(record.enjoyment / 10)
  if (record.gddlTier != null) payload.rating = record.gddlTier
  if (record.videoUrl != null) payload.proof = record.videoUrl

  let res: Response
  try {
    res = await fetch(`${GDDL_API_BASE_URL}/submissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new GddlError(
      `GDDL record submission failed with status ${res.status}: ${await res.text()}`
    )
  }

  const body = (await res.json()) as { accepted?: unknown }
  return { accepted: body.accepted === true }
}
