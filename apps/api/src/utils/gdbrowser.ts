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

// Normalized GDBrowser level — a snapshot of (essentially) everything RobTop's
// level object exposes. Maps 1:1 onto the `levels` cache columns.
export interface GdBrowserLevel {
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  length: string | null
  songName: string | null
  songAuthor: string | null
  isRated: boolean
  isDemon: boolean
  // Whether GD treats the level as a platformer (drives Level.levelType).
  platformer: boolean
  // Extended metadata (see GdBrowserLevel callers / schema.prisma Level).
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

// GDBrowser returns the string "-1" (or a non-object) when a level isn't found.
// Field names mirror GDBrowser's response (which decodes RobTop's numeric keys).
type RawGdBrowserLevel = {
  name?: unknown
  author?: unknown
  difficulty?: unknown
  length?: unknown
  songName?: unknown
  songAuthor?: unknown
  stars?: unknown
  // GDBrowser has no boolean `demon` field — demon-ness is encoded in the
  // difficulty label ("Extreme Demon") and the machine-readable partialDiff
  // ("demon-extreme"). Non-demons use values like "easy" / "hard" / "insane".
  partialDiff?: unknown
  platformer?: unknown
  description?: unknown
  playerID?: unknown
  accountID?: unknown
  cp?: unknown
  starsRequested?: unknown
  difficultyFace?: unknown
  downloads?: unknown
  likes?: unknown
  disliked?: unknown
  objects?: unknown
  large?: unknown
  coins?: unknown
  verifiedCoins?: unknown
  orbs?: unknown
  diamonds?: unknown
  featured?: unknown
  featuredPosition?: unknown
  epicValue?: unknown
  twoPlayer?: unknown
  ldm?: unknown
  copiedID?: unknown
  version?: unknown
  gameVersion?: unknown
  editorTime?: unknown
  totalEditorTime?: unknown
  officialSong?: unknown
  songID?: unknown
  songLink?: unknown
  songSize?: unknown
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const bool = (v: unknown): boolean | null =>
  typeof v === 'boolean' ? v : null

// GDBrowser uses "0" / 0 as a "none" sentinel for copied-from and song ids.
const idStr = (v: unknown): string | null => {
  const s = str(v)
  return s && s !== '0' ? s : null
}

// True when the level is any demon tier. Prefer the machine-readable
// partialDiff ("demon-*"); fall back to the human label ("… Demon").
const isDemonLevel = (raw: RawGdBrowserLevel): boolean => {
  const partial = str(raw.partialDiff)
  if (partial) return partial.toLowerCase().startsWith('demon')
  const difficulty = str(raw.difficulty)
  return difficulty ? difficulty.toLowerCase().includes('demon') : false
}

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
    const officialSong = num(raw.officialSong)
    return {
      name: str(raw.name),
      creator: str(raw.author),
      inGameDifficulty: str(raw.difficulty),
      length: str(raw.length),
      songName: str(raw.songName),
      songAuthor: str(raw.songAuthor),
      isRated: stars > 0,
      isDemon: isDemonLevel(raw),
      platformer: bool(raw.platformer) ?? false,
      description: str(raw.description),
      creatorPlayerId: idStr(raw.playerID),
      creatorAccountId: idStr(raw.accountID),
      creatorPoints: num(raw.cp),
      stars: num(raw.stars),
      starsRequested: num(raw.starsRequested),
      partialDiff: str(raw.partialDiff),
      difficultyFace: str(raw.difficultyFace),
      downloads: num(raw.downloads),
      likes: num(raw.likes),
      disliked: bool(raw.disliked),
      objectCount: num(raw.objects),
      largeLevel: bool(raw.large),
      coins: num(raw.coins),
      coinsVerified: bool(raw.verifiedCoins),
      orbs: num(raw.orbs),
      diamonds: num(raw.diamonds),
      featured: bool(raw.featured),
      featureScore: num(raw.featuredPosition),
      epicValue: num(raw.epicValue),
      twoPlayer: bool(raw.twoPlayer),
      lowDetailMode: bool(raw.ldm),
      copiedFromId: idStr(raw.copiedID),
      levelVersion: num(raw.version),
      gameVersion: str(raw.gameVersion),
      editorSeconds: num(raw.editorTime),
      editorSecondsTotal: num(raw.totalEditorTime),
      // 0 means "uses a custom song", not an official track id.
      officialSongId: officialSong === 0 ? null : officialSong,
      songId: idStr(raw.songID),
      songLink: str(raw.songLink),
      songSize: str(raw.songSize),
    }
  } catch {
    // Network error, timeout/abort, or JSON parse failure — fall back to manual.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
