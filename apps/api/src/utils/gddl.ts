// Client for the GDDL (gdladder.com) API.
//
// SECURITY: the user's API key passed through here must NEVER be logged. It is
// only ever sent in the Authorization header. Do not add logging of the key or
// of request headers to this module.

const GDDL_API_BASE_URL =
  process.env.GDDL_API_BASE_URL ?? 'https://gdladder.com/api'

// How long to wait on GDDL before giving up. Keeps a hung GDDL request from
// pinning the Lambda until its own timeout.
const VERIFY_TIMEOUT_MS = 8000

// Base class for all GDDL-side errors. The worker uses this to distinguish
// "GDDL is misbehaving" (no Sentry, user-facing message) from "our bug" (Sentry).
export class GddlError extends Error {}

// GDDL responded and explicitly rejected the key.
export class GddlInvalidKeyError extends GddlError {
  constructor(message = 'GDDL rejected the API key') {
    super(message)
    this.name = 'GddlInvalidKeyError'
  }
}

// GDDL could not be reached, timed out, or returned a server error.
export class GddlUnavailableError extends GddlError {
  constructor(message = 'GDDL is unavailable') {
    super(message)
    this.name = 'GddlUnavailableError'
  }
}

// Verifies an API key against GDDL's /user/me endpoint. Resolves with the
// GDDL account name on success; throws GddlInvalidKeyError if GDDL says the key
// is invalid; rethrows other errors (network, timeout) unchanged.
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

// GDDL exposes tiers as decimals (e.g. 18.43), but GDDL itself displays — and
// treats as canonical — the tier rounded to the nearest whole number. Round at
// every point we ingest a GDDL rating so we never store or surface the decimal.
export function roundGddlTier(rating: number): number {
  return Math.round(rating)
}

// How long to wait on the public GDDL tier lookup before giving up. Like the
// level metadata autofill, this must never block the logging flow.
const TIER_TIMEOUT_MS = 5000

// Fetches GDDL's suggested tier for a level (public list data — no key needed).
// Resolves with the numeric tier (rounded to the nearest whole number), or
// `null` for any failure (down, timeout, not-found, malformed). Never throws.
export async function fetchGddlTier(levelId: string): Promise<number | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIER_TIMEOUT_MS)

  try {
    const res = await fetch(
      `${GDDL_API_BASE_URL}/level/${encodeURIComponent(levelId)}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal }
    )
    if (!res.ok) return null

    const body = (await res.json()) as { Rating?: unknown; tier?: unknown }
    // GDDL exposes the tier as a number under "Rating" (fall back to "tier").
    const raw = typeof body.Rating === 'number' ? body.Rating : body.tier
    return typeof raw === 'number' && Number.isFinite(raw)
      ? roundGddlTier(raw)
      : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Fetches the authenticated user's GDDL account info (id + name).
// Reuses the same /user/me endpoint as verifyGddlApiKey but also extracts the
// numeric user ID needed for the submissions endpoint.
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

export interface GddlSubmission {
  ID: number
  Rating: number
  Enjoyment: number
  Proof: string | null
  DateAdded: string
  Level: GddlSubmissionLevel
}

export interface GddlSyncResponse {
  total: number
  limit: number
  page: number
  submissions: GddlSubmission[]
}

const SUBMISSIONS_PAGE_LIMIT = 25

// Fetches all pages of the user's GDDL submission history. Throws on any
// non-2xx page response so the caller can record partial progress.
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

// Fetches all level IDs currently in a GDDL user list.
// Returns string-form GD level IDs (GDDL stores them as integers).
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

// Adds a level to a GDDL user list. The body uses `levelId` (integer).
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

// Removes a level from a GDDL user list. The body uses `levelId` (integer).
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

// Submits a completion record to GDDL. Resolves with whether GDDL accepted the
// record. Throws on network/timeout/non-2xx — callers MUST treat this as
// non-blocking (the completion has already been written) and swallow failures.
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
