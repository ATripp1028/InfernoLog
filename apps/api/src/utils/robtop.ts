// Client for Geometry Dash's official servers (boomlings.com), replacing the
// GDBrowser proxy. We hit getGJLevels21 with type=10 (specific level by id) and
// parse RobTop's raw colon/pipe/tilde-delimited response into the same
// normalized shape the levels cache stores.
//
// GOLDEN RULE (unchanged from the old client): server unavailability NEVER
// blocks the logging flow. Every failure path (down, timeout, "-1", malformed)
// resolves to `null` so the caller can fall back to manual entry. This module
// never throws to its caller.
//
// Docs: https://wyliemaster.github.io/gddocs (endpoints/levels/getGJLevels21,
// resources/server/level).

const ROBTOP_API_BASE_URL =
  process.env.ROBTOP_API_BASE_URL ?? 'http://www.boomlings.com/database'

// The shared read secret for getGJLevels21 (a fixed, public constant).
const GETLEVELS_SECRET = 'Wmfd2893gb7'

// Keep a hung request from pinning the Lambda until its own timeout.
const FETCH_TIMEOUT_MS = 5000

// Normalized level — a snapshot of (essentially) everything RobTop's level
// object exposes. Field names match the `levels` cache columns 1:1, so the
// resolve handler's persistence block is source-agnostic.
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
  creatorPoints: number | null
  stars: number | null
  starsRequested: number | null
  partialDiff: string | null
  difficultyFace: string | null
  downloads: number | null
  likes: number | null
  disliked: boolean | null
  objectCount: number | null
  largeLevel: boolean | null
  coins: number | null
  coinsVerified: boolean | null
  orbs: number | null
  diamonds: number | null
  featured: boolean | null
  featureScore: number | null
  epicValue: number | null
  twoPlayer: boolean | null
  lowDetailMode: boolean | null
  copiedFromId: string | null
  levelVersion: number | null
  gameVersion: string | null
  editorSeconds: number | null
  editorSecondsTotal: number | null
  officialSongId: number | null
  songId: string | null
  songLink: string | null
  songSize: string | null
}

// getGJLevels21 only returns song metadata for custom (Newgrounds) songs. For
// levels on a built-in track it returns just the official-song index (key 12),
// so we resolve name/author from this static map. Keyed by the RAW key-12 value
// (0-based): the main-level soundtrack is 0–20, then the Meltdown / World /
// SubZero pack tracks. Source: GDBrowser's misc/music.json. Newer tracks (the
// 2.2 "Dash" level, vault levels) aren't indexed here → resolve to null.
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

// Pure parser for a getGJLevels21 response. Returns the FIRST level (we query a
// single id), joined with its creator and song, or null for "-1"/empty/garbage.
export function parseGetGJLevels21(body: string): RobtopLevel | null {
  const trimmed = body.trim()
  if (!trimmed || trimmed.startsWith('-1')) return null

  const sections = trimmed.split('#')
  const firstLevel = (sections[0] ?? '').split('|')[0]
  if (!firstLevel) return null
  const L = parsePairs(firstLevel, ':')
  if (!L['1']) return null // a valid level always has an id

  // Creators: "playerID:username:accountID" entries.
  const creators: Record<
    string,
    { username: string | null; accountId: string | null }
  > = {}
  for (const entry of (sections[1] ?? '').split('|')) {
    const [playerId, username, accountId] = entry.split(':')
    if (playerId) {
      creators[playerId] = {
        username: username || null,
        accountId: accountId || null,
      }
    }
  }

  // Songs: "~:~"-separated objects, each "~|~"-delimited key/value pairs.
  const songs: Record<string, Record<string, string>> = {}
  for (const entry of (sections[2] ?? '').split('~:~')) {
    const song = parsePairs(entry, '~|~')
    if (song['1']) songs[song['1']] = song
  }

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

  // Custom song when key 35 is a real id; otherwise it's a built-in track.
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
    name: L['2'] || null,
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
    // Not exposed by getGJLevels21 — kept null (was GDBrowser-derived).
    creatorPoints: null,
    stars,
    starsRequested: int(L['39']),
    partialDiff,
    difficultyFace: null,
    downloads: int(L['10']),
    likes,
    disliked: likes !== null ? likes < 0 : null,
    objectCount: int(L['45']),
    largeLevel: null,
    coins: int(L['37']),
    coinsVerified: L['38'] === '1',
    orbs: null,
    diamonds: null,
    featured: featureScore !== null ? featureScore > 0 : null,
    featureScore,
    epicValue: int(L['42']),
    twoPlayer: L['31'] === '1',
    lowDetailMode: L['40'] === '1',
    copiedFromId: L['30'] && L['30'] !== '0' ? L['30'] : null,
    levelVersion: int(L['5']),
    gameVersion: formatGameVersion(int(L['13'])),
    editorSeconds: int(L['46']),
    editorSecondsTotal: int(L['47']),
    officialSongId: isCustom ? null : officialSongIndex,
    songId: isCustom ? customSongId : null,
    songLink: isCustom ? decodeUrl(song?.['10']) : null,
    songSize: isCustom && song?.['5'] ? `${song['5']}MB` : null,
  }
}

// Fetches a single level by id from RobTop's getGJLevels21 (type=10). Resolves
// with the normalized level, or null for any failure (down/timeout/not-found/
// malformed). An EMPTY User-Agent is required — Cloudflare returns HTTP 1020
// otherwise.
export async function fetchRobtopLevel(
  levelId: string
): Promise<RobtopLevel | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const body = new URLSearchParams({
      type: '10',
      str: levelId,
      secret: GETLEVELS_SECRET,
      gameVersion: '22',
      binaryVersion: '42',
    })

    const res = await fetch(`${ROBTOP_API_BASE_URL}/getGJLevels21.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Must be empty to bypass Cloudflare (HTTP 1020 otherwise).
        'User-Agent': '',
      },
      body,
      signal: controller.signal,
    })
    if (!res.ok) return null

    return parseGetGJLevels21(await res.text())
  } catch {
    // Network error, timeout/abort, or parse failure — fall back to manual.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
