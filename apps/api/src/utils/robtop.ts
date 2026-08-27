// Client for Geometry Dash's official servers (boomlings.com), replacing the
// GDBrowser proxy. We hit getGJLevels21 with type=0 (search) — NOT type=10
// (specific level by id), which only returns rated levels — and parse RobTop's
// raw colon/pipe/tilde-delimited response into the same normalized shape the
// levels cache stores. See fetchRobtopLevelResult for why.
//
// GOLDEN RULE (unchanged from the old client): server unavailability NEVER
// blocks the logging flow. Every failure path (down, timeout, "-1", malformed)
// resolves to `null` so the caller can fall back to manual entry. This module
// never throws to its caller.
//
// Docs: https://wyliemaster.github.io/gddocs (endpoints/levels/getGJLevels21,
// resources/server/level).

import { logger } from './logger'
import { buildGetGJLevels21Request, summarizeErrorBody } from './robtopRequest'
import {
  acquireRobtopSlot,
  reportRobtopThrottled,
  DEFAULT_COOLDOWN_MS,
  BLOCKED_COOLDOWN_MS,
} from './robtopRateLimit'

// Parses an HTTP Retry-After header (delta-seconds or an HTTP date) to ms.
// Returns undefined when absent/unparseable so the caller uses its default.
function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined
  const secs = Number(headerValue)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const when = Date.parse(headerValue)
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now())
  return undefined
}

// Keep a hung request from pinning the Lambda until its own timeout.
const FETCH_TIMEOUT_MS = 5000

/**
 * Handles a non-OK getGJLevels21 response: logs why it failed in enough detail
 * to diagnose after the fact, and opens the shared cooldown when the status
 * means "back off", so EVERY consumer stops — not just the caller that got hit.
 *
 * Two statuses open a cooldown:
 *   - 429: RobTop is rate-limiting our IP. Honour `Retry-After` when it sends
 *     a usable one.
 *   - 403: Cloudflare denied the request at the edge (the "Sorry, you have been
 *     blocked" page) — a WAF or IP-reputation block, not a RobTop decision.
 *     There is no `Retry-After` on these, and continuing to hammer a block is a
 *     good way to keep it, so back off for a fixed window instead.
 *
 * Any other status (a 5xx origin error) is logged but opens no cooldown: it's
 * RobTop being unwell, not us being told to stop.
 *
 * `cf-ray` identifies the request in Cloudflare's own logs and `cf-mitigated`
 * names the action it took; the body snippet distinguishes a block page from an
 * origin error. Without these, a 403 run is indistinguishable after the fact
 * from any other failure — which is exactly what happened in the Aug 2026
 * block. Best-effort throughout: nothing here may change what the caller
 * returns.
 *
 * @param res - The non-OK response.
 * @param context - Caller identity for the log line (`levelId` or `name`).
 * @returns Why the call failed, for callers that report on it.
 */
async function reportNonOkResponse(
  res: Response,
  context: Record<string, string>
): Promise<RobtopUnreachableReason> {
  let body = ''
  try {
    body = await res.text()
  } catch {
    // A body we can't read is not worth failing over.
  }

  logger.warn(
    {
      ...context,
      status: res.status,
      cfRay: res.headers.get('cf-ray'),
      cfMitigated: res.headers.get('cf-mitigated'),
      server: res.headers.get('server'),
      ...summarizeErrorBody(body),
    },
    'fetchRobtopLevel: non-OK response'
  )

  if (res.status !== 429 && res.status !== 403) return 'http_error'

  const cooldownMs =
    res.status === 429
      ? (parseRetryAfterMs(res.headers.get('retry-after')) ??
        DEFAULT_COOLDOWN_MS)
      : BLOCKED_COOLDOWN_MS
  try {
    await reportRobtopThrottled(cooldownMs)
  } catch (err) {
    logger.warn({ ...context, err }, 'fetchRobtopLevel: cooldown write failed')
  }
  return res.status === 429 ? 'throttled' : 'blocked'
}

/**
 * Normalized level — a snapshot of (essentially) everything RobTop's level
 * object exposes. Field names match the `levels` cache columns 1:1, so the
 * resolve handler's persistence block is source-agnostic.
 */
export interface RobtopLevel {
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  length: string | null
  songName: string | null
  songAuthor: string | null
  isRated: boolean
  isDemon: boolean
  platformer: boolean
  description: string | null
  creatorPlayerId: string | null
  creatorAccountId: string | null
  stars: number | null
  starsRequested: number | null
  partialDiff: string | null
  downloads: number | null
  likes: number | null
  disliked: boolean | null
  objectCount: number | null
  coins: number | null
  coinsVerified: boolean | null
  featured: boolean | null
  featureScore: number | null
  epicValue: number | null
  twoPlayer: boolean | null
  lowDetailMode: boolean | null
  copiedFromId: string | null
  levelVersion: number | null
  gameVersion: string | null
  officialSongId: number | null
  songId: string | null
  songLink: string | null
  // Raw megabyte value (e.g. 9.56). Format at the display layer.
  songSize: number | null
}

/**
 * getGJLevels21 only returns song metadata for custom (Newgrounds) songs. For
 * levels on a built-in track it returns just the official-song index (key 12),
 * so we resolve name/author from this static map. Keyed by the RAW key-12 value
 * (0-based): the main-level soundtrack is 0–20, then the Meltdown / World /
 * SubZero pack tracks. Source: GDBrowser's misc/music.json. Newer tracks (the
 * 2.2 "Dash" level, vault levels) aren't indexed here → resolve to null.
 */
export const OFFICIAL_SONGS: Record<number, { name: string; author: string }> =
  {
    0: { name: 'Stereo Madness', author: 'ForeverBound' },
    1: { name: 'Back On Track', author: 'DJVI' },
    2: { name: 'Polargeist', author: 'Step' },
    3: { name: 'Dry Out', author: 'DJVI' },
    4: { name: 'Base After Base', author: 'DJVI' },
    5: { name: "Can't Let Go", author: 'DJVI' },
    6: { name: 'Jumper', author: 'Waterflame' },
    7: { name: 'Time Machine', author: 'Waterflame' },
    8: { name: 'Cycles', author: 'DJVI' },
    9: { name: 'xStep', author: 'DJVI' },
    10: { name: 'Clutterfunk', author: 'Waterflame' },
    11: { name: 'Theory of Everything', author: 'DJ-Nate' },
    12: { name: 'Electroman Adventures', author: 'Waterflame' },
    13: { name: 'Clubstep', author: 'DJ-Nate' },
    14: { name: 'Electrodynamix', author: 'DJ-Nate' },
    15: { name: 'Hexagon Force', author: 'Waterflame' },
    16: { name: 'Blast Processing', author: 'Waterflame' },
    17: { name: 'Theory of Everything 2', author: 'DJ-Nate' },
    18: { name: 'Geometrical Dominator', author: 'Waterflame' },
    19: { name: 'Deadlocked', author: 'F-777' },
    20: { name: 'Fingerdash', author: 'MDK' },
    // Meltdown
    21: { name: 'The Seven Seas', author: 'F-777' },
    22: { name: 'Viking Arena', author: 'F-777' },
    23: { name: 'Airborne Robots', author: 'F-777' },
    // The Challenge (secret level)
    24: { name: 'The Challenge', author: 'RobTop' },
    // World
    25: { name: 'Payload', author: 'Dex Arson' },
    26: { name: 'Beast Mode', author: 'Dex Arson' },
    27: { name: 'Machina', author: 'Dex Arson' },
    28: { name: 'Years', author: 'Dex Arson' },
    29: { name: 'Frontlines', author: 'Dex Arson' },
    30: { name: 'Space Pirates', author: 'Waterflame' },
    31: { name: 'Striker', author: 'Waterflame' },
    32: { name: 'Embers', author: 'Dex Arson' },
    33: { name: 'Round 1', author: 'Dex Arson' },
    34: { name: 'Monster Dance Off', author: 'F-777' },
    // SubZero
    35: { name: 'Press Start', author: 'MDK' },
    36: { name: 'Nock Em', author: 'Bossfight' },
    37: { name: 'Power Trip', author: 'Boom Kitty' },
    // Main levels (2.2+)
    38: { name: 'Dash', author: 'MDK' },
  }

// Length values 0–4 (key 15); 5 denotes a platformer level.
const LENGTHS = ['Tiny', 'Short', 'Medium', 'Long', 'XL', 'Platformer'] as const

const int = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null
  const n = Number.parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

const float = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null
  const n = Number.parseFloat(v)
  return Number.isNaN(n) ? null : n
}

// GD descriptions are base64 (occasionally url-safe). Empty/garbage → null.
const decodeDescription = (v: string | undefined): string | null => {
  if (!v) return null
  try {
    const decoded = Buffer.from(
      v.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8')
    return decoded || null
  } catch {
    return null
  }
}

const decodeUrl = (v: string | undefined): string | null => {
  if (!v || v === '-') return null
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

// RobTop's gameVersion is an integer (21 → "2.1"). Pre-1.7 used a bespoke table.
const formatGameVersion = (v: number | null): string | null => {
  if (v === null) return null
  if (v >= 10) return `${Math.floor(v / 10)}.${v % 10}`
  const legacy: Record<number, string> = {
    1: '1.0',
    2: '1.1',
    3: '1.2',
    4: '1.3',
    5: '1.4',
    6: '1.5',
    7: '1.6',
  }
  return legacy[v] ?? String(v)
}

const DEMON_TIERS: Record<number, string> = {
  0: 'Hard',
  3: 'Easy',
  4: 'Medium',
  5: 'Insane',
  6: 'Extreme',
}
const NUMERATOR_DIFFS: Record<number, string> = {
  10: 'Easy',
  20: 'Normal',
  30: 'Hard',
  40: 'Harder',
  50: 'Insane',
}

function deriveDifficulty(
  denominator: number | null,
  numerator: number | null,
  auto: boolean,
  demon: boolean,
  demonDiff: number | null
): { label: string; partial: string } {
  if (demon) {
    const tier = DEMON_TIERS[demonDiff ?? 0] ?? 'Hard'
    return { label: `${tier} Demon`, partial: `demon-${tier.toLowerCase()}` }
  }
  if (auto) return { label: 'Auto', partial: 'auto' }
  if ((denominator ?? 0) > 0) {
    const label = NUMERATOR_DIFFS[numerator ?? 0]
    if (label) return { label, partial: label.toLowerCase() }
  }
  return { label: 'Unrated', partial: 'na' }
}

// Splits a "key<sep>value<sep>key<sep>value" string into a record. Used for the
// level dict (sep ":") and each song object (sep "~|~").
function parsePairs(str: string, sep: string): Record<string, string> {
  const tokens = str.split(sep)
  const out: Record<string, string> = {}
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    out[tokens[i] as string] = tokens[i + 1] as string
  }
  return out
}

type CreatorMap = Record<
  string,
  { username: string | null; accountId: string | null }
>
type SongMap = Record<string, Record<string, string>>

function parseCreatorSection(section: string): CreatorMap {
  const map: CreatorMap = {}
  for (const entry of section.split('|')) {
    const [playerId, username, accountId] = entry.split(':')
    if (playerId)
      map[playerId] = {
        username: username || null,
        accountId: accountId || null,
      }
  }
  return map
}

function parseSongSection(section: string): SongMap {
  const map: SongMap = {}
  for (const entry of section.split('~:~')) {
    const song = parsePairs(entry, '~|~')
    if (song['1']) map[song['1']] = song
  }
  return map
}

function buildRobtopLevel(
  L: Record<string, string>,
  creators: CreatorMap,
  songs: SongMap
): RobtopLevel {
  const demon = L['17'] === '1'
  const auto = L['25'] === '1'
  const { label: inGameDifficulty, partial: partialDiff } = deriveDifficulty(
    int(L['8']),
    int(L['9']),
    auto,
    demon,
    int(L['43'])
  )

  const lengthVal = int(L['15'])
  const stars = int(L['18'])
  const featureScore = int(L['19'])
  const likes = int(L['14'])

  const customSongId = L['35']
  const isCustom = !!customSongId && customSongId !== '0'
  const song = isCustom ? songs[customSongId] : undefined
  const officialSongIndex = int(L['12'])
  const official =
    !isCustom && officialSongIndex !== null
      ? OFFICIAL_SONGS[officialSongIndex]
      : undefined

  const creator = creators[L['6'] ?? '']

  return {
    // RobTop stores some level names with trailing/leading whitespace; trim so
    // stored names are clean and exact-name matching during import works.
    name: L['2']?.trim() || null,
    creator: creator?.username ?? null,
    inGameDifficulty,
    length: lengthVal !== null ? (LENGTHS[lengthVal] ?? null) : null,
    songName: isCustom ? (song?.['2'] ?? null) : (official?.name ?? null),
    songAuthor: isCustom ? (song?.['4'] ?? null) : (official?.author ?? null),
    isRated: (stars ?? 0) > 0,
    isDemon: demon,
    platformer: lengthVal === 5,
    description: decodeDescription(L['3']),
    creatorPlayerId: L['6'] || null,
    creatorAccountId: creator?.accountId ?? null,
    stars,
    starsRequested: int(L['39']),
    partialDiff,
    downloads: int(L['10']),
    likes,
    disliked: likes !== null ? likes < 0 : null,
    objectCount: int(L['45']),
    coins: int(L['37']),
    coinsVerified: L['38'] === '1',
    featured: featureScore !== null ? featureScore > 0 : null,
    featureScore,
    epicValue: int(L['42']),
    twoPlayer: L['31'] === '1',
    lowDetailMode: L['40'] === '1',
    copiedFromId: L['30'] && L['30'] !== '0' ? L['30'] : null,
    levelVersion: int(L['5']),
    gameVersion: formatGameVersion(int(L['13'])),
    officialSongId: isCustom ? null : officialSongIndex,
    songId: isCustom ? customSongId : null,
    songLink: isCustom ? decodeUrl(song?.['10']) : null,
    songSize: isCustom ? float(song?.['5']) : null,
  }
}

/** One level from a multi-result getGJLevels21 response, with its id. */
export interface RobtopSearchResult {
  levelId: string
  level: RobtopLevel
}

/**
 * Parses all levels from a getGJLevels21 response body.
 */
export function parseAllFromGetGJLevels21(body: string): RobtopSearchResult[] {
  const trimmed = body.trim()
  if (!trimmed || trimmed.startsWith('-1')) return []

  const sections = trimmed.split('#')
  const creators = parseCreatorSection(sections[1] ?? '')
  const songs = parseSongSection(sections[2] ?? '')

  return (sections[0] ?? '')
    .split('|')
    .filter(Boolean)
    .flatMap((e) => {
      const L = parsePairs(e, ':')
      if (!L['1']) return []
      return [{ levelId: L['1'], level: buildRobtopLevel(L, creators, songs) }]
    })
}

/**
 * Pure parser for a getGJLevels21 response. Returns the level matching `wantId`
 * (or the first level when omitted), or null for "-1"/empty/garbage.
 */
export function parseGetGJLevels21(
  body: string,
  wantId?: string
): RobtopLevel | null {
  const all = parseAllFromGetGJLevels21(body)
  if (!all.length) return null
  const found =
    (wantId ? all.find((x) => x.levelId === wantId) : undefined) ?? all[0]
  return found?.level ?? null
}

/**
 * Fetches a single level by id from RobTop's getGJLevels21. We use type=0
 * (search) rather than type=10 (specific levels) because type=10 only returns
 * RATED levels — type=0 returns the exact level for rated AND unrated ids alike
 * (including community-voted difficulty for unrated levels). Resolves with the
 * normalized level, or null for any failure (down/timeout/not-found/malformed).
 * An EMPTY User-Agent is required — Cloudflare returns HTTP 1020 otherwise.
 * A RobTop fetch outcome that distinguishes the two failure modes callers may
 * need to branch on:
 *   - 'found'       → the level object
 *   - 'not_found'   → GD answered but has no such level (200 with a "-1"/empty
 *                     body). Terminal: the id does not exist.
 *   - 'unreachable' → the call itself couldn't complete (rate-limiter timeout,
 *                     non-OK response, network error, timeout, parse failure).
 *                     Retryable: says nothing about whether the level exists.
 */
/**
 * Why a RobTop call could not complete. Every one of these is retryable and says
 * nothing about whether the level exists — but they are NOT interchangeable
 * when reporting: `blocked`/`throttled` mean GD's edge refused us and the
 * problem may be our egress or our request, while `timeout`/`network` mean
 * nobody refused anything and the request simply didn't finish. The reachability
 * canary alerts differently on each, because the runbook differs.
 *
 *   - 'limiter'    → the shared rate limiter gave us no slot (bucket drained, or
 *                    a cooldown is open). We never called RobTop.
 *   - 'blocked'    → HTTP 403. Cloudflare refused the request at the edge.
 *   - 'throttled'  → HTTP 429. RobTop is rate-limiting our IP.
 *   - 'http_error' → any other non-OK status; RobTop's origin answering badly.
 *   - 'timeout'    → our own FETCH_TIMEOUT_MS aborted the request.
 *   - 'network'    → the fetch threw, or the response could not be parsed.
 */
export type RobtopUnreachableReason =
  | 'limiter'
  | 'blocked'
  | 'throttled'
  | 'http_error'
  | 'timeout'
  | 'network'

export type RobtopFetchResult =
  | { status: 'found'; level: RobtopLevel }
  | { status: 'not_found' }
  | { status: 'unreachable'; reason: RobtopUnreachableReason }

/**
 * Lower-level fetch that preserves the not-found vs unreachable distinction.
 * `fetchRobtopLevel` collapses this to `RobtopLevel | null` for the many callers
 * that only care whether they got a level.
 *
 * @param levelId - GD level ID.
 * @param limiterWaitMs - How long to wait for a shared rate-limiter slot before
 *   giving up. Defaults to the limiter's own wait, which is tuned for
 *   user-facing calls. Note a limiter timeout is reported as `unreachable` like
 *   any other failure, so a caller that must not confuse "we never called" with
 *   "RobTop would not answer" — the reachability canary — passes a wait long
 *   enough that only an open cooldown can deny it a slot.
 */
export async function fetchRobtopLevelResult(
  levelId: string,
  limiterWaitMs?: number
): Promise<RobtopFetchResult> {
  if (!(await acquireRobtopSlot(limiterWaitMs))) {
    logger.warn({ levelId }, 'fetchRobtopLevel: rate limiter timed out')
    return { status: 'unreachable', reason: 'limiter' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const { url, init } = buildGetGJLevels21Request({
      type: '0',
      str: levelId,
    })
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      // A genuine failure (not "level doesn't exist" — that's a 200 with a
      // "-1" body, handled below without logging). This is the branch a
      // Cloudflare block, rate limit, or RobTop outage takes; the helper logs
      // it and opens the shared cooldown when the status says to back off.
      const reason = await reportNonOkResponse(res, { levelId })
      return { status: 'unreachable', reason }
    }

    // Select the exact id — a numeric search can return name-matched levels too.
    // A null parse here means GD returned no such level (the "-1"/empty body).
    const level = parseGetGJLevels21(await res.text(), levelId)
    return level ? { status: 'found', level } : { status: 'not_found' }
  } catch (err) {
    // Network error, timeout/abort, or parse failure — retryable, and says
    // nothing about whether the level exists. Log first so a persistent failure
    // is diagnosable instead of silently retried into oblivion.
    //
    // An AbortError here is OUR timeout firing (FETCH_TIMEOUT_MS), not a
    // refusal by anyone: worth separating, because a caller that pages a human
    // must not describe a slow response as a block.
    const reason =
      err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network'
    logger.warn({ levelId, err, reason }, 'fetchRobtopLevel: request failed')
    return { status: 'unreachable', reason }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetches one level from GD's servers, collapsing every failure to null.
 *
 * Convenience wrapper over `fetchRobtopLevelResult` for callers that cannot act
 * on WHY the lookup failed. Note this makes "GD says no such level" and "GD was
 * unreachable" indistinguishable — anything that must tell them apart (the
 * level-cache sync's delisting logic, the level page's 404-vs-503) has to use
 * `fetchRobtopLevelResult` instead.
 *
 * @param levelId - GD level ID.
 * @returns The normalized level, or null if not found OR unreachable.
 */
export async function fetchRobtopLevel(
  levelId: string
): Promise<RobtopLevel | null> {
  const result = await fetchRobtopLevelResult(levelId)
  return result.status === 'found' ? result.level : null
}

/**
 * A name-search outcome that preserves the reachable/unreachable distinction,
 * mirroring RobtopFetchResult. `ok` with an empty array is a genuine "GD found
 * nothing" (a 200 with a "-1"/empty body); `unreachable` is a call that
 * couldn't complete (rate-limiter timeout, non-OK, network/timeout/parse) and
 * is retryable. The toolbar's GD escalation needs this split so a request
 * failure reads differently from a legitimate empty result set.
 *
 * Deliberately does NOT carry a `RobtopUnreachableReason`, unlike the by-id
 * result: nothing alerts on a failed search — it degrades to "no results" in
 * the UI — so the reason would be a field every consumer forwards and none
 * reads. The failure is still logged in full by reportNonOkResponse.
 */
export type RobtopSearchOutcome =
  | { status: 'ok'; results: RobtopSearchResult[] }
  | { status: 'unreachable' }

/**
 * Options for a getGJLevels21 name search / browse.
 */
export interface RobtopSearchOptions {
  // Difficulty scoping (import's exact-match path uses these directly).
  diff?: string
  demonFilter?: string
  // getGJLevels21 `type` — 0 (search by str, the default), 1 (most downloaded),
  // 2 (most liked). The /search escalation sets this from the on-page sort when
  // browsing with no query term.
  type?: string
  // Extra getGJLevels21 body params (len, twoPlayer, coins, featured, epic,
  // star, customSong, …) forwarded from the /search page's filters. Applied
  // last, so they win over diff/demonFilter if both are supplied.
  extraParams?: Record<string, string>
}

/**
 * Searches RobTop's getGJLevels21 by level name. Pass diff/demonFilter (or the
 * wider option set) to scope results; an empty `name` with a `type` browses
 * (e.g. most-downloaded) rather than searching.
 */
export async function searchRobtopByNameResult(
  name: string,
  options?: RobtopSearchOptions
): Promise<RobtopSearchOutcome> {
  if (!(await acquireRobtopSlot())) {
    logger.warn({ name }, 'searchRobtopByName: rate limiter timed out')
    return { status: 'unreachable' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const params: Record<string, string> = {
      type: options?.type ?? '0',
      str: name,
      count: '10',
    }
    if (options?.diff !== undefined) params.diff = options.diff
    if (options?.demonFilter !== undefined)
      params.demonFilter = options.demonFilter
    // Applied last, so a caller's extras win over diff/demonFilter.
    if (options?.extraParams) Object.assign(params, options.extraParams)

    const { url, init } = buildGetGJLevels21Request(params)
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      // Same logging and shared-cooldown backoff as fetchRobtopLevelResult.
      await reportNonOkResponse(res, { name })
      return { status: 'unreachable' }
    }

    return {
      status: 'ok',
      results: parseAllFromGetGJLevels21(await res.text()),
    }
  } catch {
    return { status: 'unreachable' }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Array-returning wrapper for callers that only need matches and treat any
 * failure as "no resolution" (spreadsheet import). Returns [] on unreachable.
 */
export async function searchRobtopByName(
  name: string,
  options?: RobtopSearchOptions
): Promise<RobtopSearchResult[]> {
  const outcome = await searchRobtopByNameResult(name, options)
  return outcome.status === 'ok' ? outcome.results : []
}
