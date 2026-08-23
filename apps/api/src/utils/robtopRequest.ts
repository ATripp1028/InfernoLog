// How we talk to RobTop's servers, and how we read a refusal — the two pieces
// that must be identical everywhere, split out from the client itself.
//
// This module deliberately imports NOTHING. `robtop.ts` reaches the shared rate
// limiter and through it Prisma, which binds a Neon pool at import time; the
// diagnostic probe (scripts/probeRobtop.ts) has to run from a laptop with no
// database and no AWS credentials, and its whole value is being a byte-for-byte
// reproduction of the real request. Keeping the request builder here lets the
// probe share it instead of maintaining a copy that silently drifts.

/** Base URL for GD's servers. `ROBTOP_API_BASE_URL` overrides it per stage. */
export const ROBTOP_API_BASE_URL =
  process.env.ROBTOP_API_BASE_URL ?? 'https://www.boomlings.com/database'

/** The shared read secret for getGJLevels21 (a fixed, public constant). */
export const GETLEVELS_SECRET = 'Wmfd2893gb7'

/**
 * Builds a getGJLevels21 request: the URL and everything about the POST except
 * the abort signal, which each caller owns.
 *
 * The empty `User-Agent` is the load-bearing part. Cloudflare sits in front of
 * boomlings and blocks the request outright without it — both a normal UA and
 * an ABSENT one are refused, so this cannot be left to a default. Node's fetch
 * adds its own UA when the header is missing, which is why it is set explicitly
 * rather than omitted.
 *
 * @param params - Request-specific params (`type`, `str`, `count`, filters).
 *   Merged over the fixed secret/version params, so a caller can override them.
 * @returns The URL and a `RequestInit` ready to pass to `fetch`.
 */
export function buildGetGJLevels21Request(params: Record<string, string>): {
  url: string
  init: RequestInit
} {
  return {
    url: `${ROBTOP_API_BASE_URL}/getGJLevels21.php`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Must be empty to bypass Cloudflare (HTTP 1020 otherwise).
        'User-Agent': '',
      },
      body: new URLSearchParams({
        secret: GETLEVELS_SECRET,
        gameVersion: '22',
        binaryVersion: '42',
        ...params,
      }),
    },
  }
}

// Markers from Cloudflare's block page. It is served as a full HTML document
// whose first few KB are a DOCTYPE and IE conditional comments — identical
// across every Cloudflare error page — so recognising a block means searching
// the body, not sampling the front of it.
const BLOCK_PAGE_MARKERS = [
  /Sorry, you have been blocked/i,
  /Attention Required!\s*\|\s*Cloudflare/i,
  /cf-error-details/i,
]

/** What a failed response's body says about why it failed. */
export interface ErrorBodySummary {
  // True when the body is recognisably a Cloudflare block page.
  blockPage: boolean
  // The most identifying line found: a Cloudflare error code when the page
  // carries one, else the block headline or page title, else undefined.
  marker?: string
  // A short excerpt, only for bodies we could NOT classify — an unrecognised
  // body is the case where raw text is worth having.
  snippet?: string
}

/**
 * Summarises the body of a non-OK response into something worth logging.
 *
 * Note what this can and cannot establish. It reliably separates "Cloudflare
 * refused us" from "the origin answered badly". It does NOT identify WHICH rule
 * fired: boomlings' block page carries no numeric error code, and `cf-ray`
 * resolves only inside RobTop's own Cloudflare account, not ours. Telling a
 * request-shape block from an egress-IP block needs the same request run from
 * somewhere else at the same moment — that is what scripts/probeRobtop.ts is
 * for.
 *
 * @param body - The response body, or '' when it could not be read.
 * @returns The summary; `blockPage` false with no marker for an empty body.
 */
export function summarizeErrorBody(body: string): ErrorBodySummary {
  if (!body) return { blockPage: false }

  const blockPage = BLOCK_PAGE_MARKERS.some((re) => re.test(body))

  // Cloudflare pages sometimes carry a numeric code (1020 access denied, 1015
  // rate limited, 1006/1007/1008 IP banned). boomlings' does not today, but it
  // is the single most useful field when it is there.
  const code = /error code:?\s*(\d{3,4})|\bError\s+(1\d{3})\b/i.exec(body)
  if (code) {
    return { blockPage, marker: `cloudflare ${code[1] ?? code[2]}` }
  }

  const headline = /<h1[^>]*>\s*([^<]{3,120}?)\s*</.exec(body)
  const title = /<title[^>]*>\s*([^<]{3,120}?)\s*</.exec(body)
  const marker = headline?.[1] ?? title?.[1]
  if (marker) return { blockPage, marker }

  return { blockPage, snippet: body.slice(0, 200) }
}
