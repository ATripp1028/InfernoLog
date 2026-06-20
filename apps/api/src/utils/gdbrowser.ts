// Client for the GDBrowser (gdbrowser.com) API — server-side level metadata
// autofill. See EXTERNAL_APIS.md.
//
// GOLDEN RULE: GDBrowser unavailability NEVER blocks the logging flow. Every
// failure path (down, timeout, not-found, malformed) resolves to `null` so the
// caller can fall back to manual entry. This module never throws to its caller.

const GDBROWSER_API_BASE_URL =
  process.env.GDBROWSER_API_BASE_URL ?? 'https://gdbrowser.com/api'

// Keep a hung GDBrowser request from pinning the Lambda until its own timeout.
const FETCH_TIMEOUT_MS = 5000

// Normalized subset of GDBrowser's response that maps onto our `levels` cache.
export interface GdBrowserLevel {
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  length: string | null
  songName: string | null
  songAuthor: string | null
  isRated: boolean
  isDemon: boolean
}

// GDBrowser returns the string "-1" (or a non-object) when a level isn't found.
type RawGdBrowserLevel = {
  name?: unknown
  author?: unknown
  difficulty?: unknown
  length?: unknown
  song?: unknown
  songAuthor?: unknown
  stars?: unknown
  demon?: unknown
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null

// Fetches level metadata from GDBrowser. Resolves with the normalized level on
// success, or `null` for any failure (down/timeout/not-found/malformed).
export async function fetchGdBrowserLevel(
  levelId: string
): Promise<GdBrowserLevel | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(
      `${GDBROWSER_API_BASE_URL}/level/${encodeURIComponent(levelId)}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal }
    )
    if (!res.ok) return null

    const body: unknown = await res.json()
    // "-1" or any non-object payload means not found.
    if (!body || typeof body !== 'object') return null

    const raw = body as RawGdBrowserLevel
    // A valid level always has a name; its absence means a not-found sentinel.
    if (str(raw.name) === null) return null

    const stars = typeof raw.stars === 'number' ? raw.stars : 0
    return {
      name: str(raw.name),
      creator: str(raw.author),
      inGameDifficulty: str(raw.difficulty),
      length: str(raw.length),
      songName: str(raw.song),
      songAuthor: str(raw.songAuthor),
      isRated: stars > 0,
      // GDBrowser reports `demon` as a boolean.
      isDemon: raw.demon === true,
    }
  } catch {
    // Network error, timeout/abort, or JSON parse failure — fall back to manual.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
