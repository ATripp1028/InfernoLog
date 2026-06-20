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
