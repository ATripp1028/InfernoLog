// Client for Song File Hub (SFH) — the community NONG (Not On NewGrounds) song
// registry. We hit /songs?levelID={id}&states={state} and, if a match exists,
// treat the level as a NONG and cache SFH's song metadata.
//
// The `state` mirrors the GD level's rating status: a rated level's NONG lives
// under states=rated, an unrated level's under states=unrated. states=rated is
// the curated set (excludes mashups/remixes of Newgrounds-hosted songs);
// states=unrated is not vetted the same way, so an unrated match is a weaker
// signal — see EXTERNAL_APIS.md.
//
// GOLDEN RULE (same as robtop.ts / gddl.ts): SFH being slow/down/erroring is an
// EXPECTED branch, never a blocking error. A failed call resolves to
// `undefined` so the caller leaves `sfhCheckedAt` null and retries later; it
// NEVER throws and NEVER sets isNong. See EXTERNAL_APIS.md.

import { logger } from './logger'

const SFH_API_BASE_URL =
  process.env.SFH_API_BASE_URL ?? 'https://api.songfilehub.com'

// Which SFH catalog to query. Picked from the GD level's rating status.
export type SfhState = 'rated' | 'unrated'

// Keep a hung SFH request from stalling a resolve call or a sync batch.
const FETCH_TIMEOUT_MS = 5000

// Normalized SFH result — the sfh* fields written to the levels cache 1:1.
export interface SongFileHubResult {
  sfhId: string
  sfhSongId: string
  sfhSongName: string
  sfhYoutubeUrl: string
  sfhYoutubeVideoId: string
  sfhDownloadUrl: string
  sfhFileType: string
  sfhDownloads: number
}

// One element of SFH's /songs array. Only the fields we persist are typed; the
// rest of the payload (urlHash, imageHash, state, …) is ignored.
interface SfhSongRaw {
  _id?: unknown
  songID?: unknown
  songName?: unknown
  songURL?: unknown
  ytVideoID?: unknown
  downloadUrl?: unknown
  filetype?: unknown
  downloads?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

function normalize(raw: SfhSongRaw): SongFileHubResult {
  return {
    sfhId: str(raw._id),
    sfhSongId: str(raw.songID),
    sfhSongName: str(raw.songName),
    sfhYoutubeUrl: str(raw.songURL),
    sfhYoutubeVideoId: str(raw.ytVideoID),
    sfhDownloadUrl: str(raw.downloadUrl),
    sfhFileType: str(raw.filetype),
    sfhDownloads: num(raw.downloads),
  }
}

// Fetches the NONG for a level from Song File Hub, querying the catalog that
// matches its rating status (`state`, default 'rated'). Returns:
//   - a SongFileHubResult if a NONG exists in that catalog (highest `downloads`
//     wins if the array has more than one entry — not expected in practice,
//     since the query is level-scoped, but handled defensively)
//   - null if the call succeeded but the array was empty (no NONG — a valid,
//     cacheable "checked, none found" result)
//   - undefined if the call itself failed (network/timeout/non-2xx) — the
//     caller must NOT stamp sfhCheckedAt in this case
// Never throws.
export async function fetchSongFileHubNong(
  levelId: string,
  state: SfhState = 'rated'
): Promise<SongFileHubResult | null | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const url =
      `${SFH_API_BASE_URL}/songs` +
      `?levelID=${encodeURIComponent(levelId)}&states=${state}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      // Genuine failure (down/rate-limited/5xx), not "no NONG" — that's a 200
      // with an empty array, handled below. Warn (not error): expected branch,
      // same philosophy as RobTop/GDDL unavailability.
      logger.warn(
        { levelId, status: res.status },
        'fetchSongFileHubNong: non-OK response'
      )
      return undefined
    }

    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) {
      // Unexpected shape — treat as a failure (retry later), not a cacheable
      // "none found".
      logger.warn({ levelId }, 'fetchSongFileHubNong: unexpected response shape')
      return undefined
    }
    if (body.length === 0) return null

    // Pick the highest-downloads entry as canonical (multiple results aren't
    // expected for a level-scoped query, but be deterministic if they appear).
    const best = (body as SfhSongRaw[]).reduce((a, b) =>
      num(b.downloads) > num(a.downloads) ? b : a
    )
    return normalize(best)
  } catch (err) {
    // Network error, timeout/abort, or JSON parse failure — leave sfhCheckedAt
    // null so the sync job retries. Warn so a persistent failure is diagnosable
    // (same as RobTop unavailability), but never throw to the caller.
    logger.warn({ levelId, err }, 'fetchSongFileHubNong: request failed')
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}
