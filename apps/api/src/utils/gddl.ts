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

// Thrown when GDDL responds but rejects the key (or returns a shape that means
// the key isn't a valid, named user). Distinct from network/timeout failures,
// which propagate as ordinary errors and should surface as a 500 — we only
// tell the user their key is invalid when GDDL actually said so.
export class GddlInvalidKeyError extends Error {
  constructor(message = 'GDDL rejected the API key') {
    super(message)
    this.name = 'GddlInvalidKeyError'
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

// How long to wait on the public GDDL tier lookup before giving up. Like the
// level metadata autofill, this must never block the logging flow.
const TIER_TIMEOUT_MS = 5000

// Fetches GDDL's suggested tier for a level (public list data — no key needed).
// Resolves with the numeric tier, or `null` for any failure (down, timeout,
// not-found, malformed). Never throws to its caller.
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
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
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
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
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
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      throw new Error(
        `GDDL submissions page ${page} returned status ${res.status}`
      )
    }

    const body = (await res.json()) as GddlSyncResponse
    const submissions = body.submissions as GddlSubmission[] | undefined
    if (!Array.isArray(submissions)) {
      throw new Error(`GDDL submissions page ${page} returned unexpected shape`)
    }

    all.push(...submissions)
    if (submissions.length < SUBMISSIONS_PAGE_LIMIT) break
    page++
  }

  return all
}

// How long to wait on a GDDL record submission before giving up. This call is
// fire-and-forget from the completion flow; the timeout just bounds the work.
const SUBMIT_TIMEOUT_MS = 8000

// Submits a completion record to GDDL. Resolves with whether GDDL accepted the
// record. Throws on network/timeout/non-2xx — callers MUST treat this as
// non-blocking (the completion has already been written) and swallow failures.
export async function submitGddlRecord(
  apiKey: string,
  record: { levelId: string; videoUrl: string | null }
): Promise<{ accepted: boolean }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${GDDL_API_BASE_URL}/record`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        levelID: record.levelId,
        videoLink: record.videoUrl,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new Error(`GDDL record submission failed with status ${res.status}`)
  }

  const body = (await res.json()) as { accepted?: unknown }
  return { accepted: body.accepted === true }
}
