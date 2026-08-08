// The single mapping from a RobTop level snapshot onto `levels` cache columns.
//
// Every path that fetches a level from GD's servers and persists it goes
// through here: the logging flow's /resolve endpoint, the GD search escalation,
// the GDDL record + list syncs, the spreadsheet import's stub upgrade, and the
// seed worker. The field list used to be copy-pasted into each of those five
// modules, so adding a column to `levels` meant finding and editing all of them
// — and they had already drifted (see `stamped` below).

import type { Prisma } from '@prisma/client'
import type { RobtopLevel } from '../../utils/robtop'

/** The `levels` columns owned by a RobTop snapshot — everything except the
 * `inGameId` primary key and our own bookkeeping (`lastCheckedAt`,
 * `delistedAt`, `missingSince`, the `sfh*` NONG fields). Kept 1:1 with
 * {@link RobtopLevel}, whose field names deliberately match these columns. */
type RobtopLevelFields = Omit<Prisma.LevelUncheckedCreateInput, 'inGameId'>

/**
 * Maps a RobTop snapshot onto the `levels` columns it owns.
 *
 * `dataSource`/`verified` are pinned to `robtop_autofill`/`true`: reaching this
 * function at all means GD's servers answered with a real level, which is
 * exactly what "verified" records.
 *
 * @param gd - Normalized level from {@link fetchRobtopLevel}.
 * @returns Column values, without `inGameId` — use {@link buildRobtopCreateData}
 * or {@link buildRobtopRefreshData} rather than calling this directly.
 */
function robtopLevelFields(gd: RobtopLevel): RobtopLevelFields {
  return {
    levelType: gd.platformer ? 'PLATFORMER' : 'CLASSIC',
    name: gd.name,
    creator: gd.creator,
    inGameDifficulty: gd.inGameDifficulty,
    length: gd.length,
    songName: gd.songName,
    songAuthor: gd.songAuthor,
    isRated: gd.isRated,
    isDemon: gd.isDemon,
    description: gd.description,
    creatorPlayerId: gd.creatorPlayerId,
    creatorAccountId: gd.creatorAccountId,
    stars: gd.stars,
    starsRequested: gd.starsRequested,
    partialDiff: gd.partialDiff,
    downloads: gd.downloads,
    likes: gd.likes,
    disliked: gd.disliked,
    objectCount: gd.objectCount,
    coins: gd.coins,
    coinsVerified: gd.coinsVerified,
    featured: gd.featured,
    featureScore: gd.featureScore,
    epicValue: gd.epicValue,
    twoPlayer: gd.twoPlayer,
    lowDetailMode: gd.lowDetailMode,
    copiedFromId: gd.copiedFromId,
    levelVersion: gd.levelVersion,
    gameVersion: gd.gameVersion,
    officialSongId: gd.officialSongId,
    songId: gd.songId,
    songLink: gd.songLink,
    songSize: gd.songSize,
    dataSource: 'robtop_autofill',
    verified: true,
  }
}

/**
 * Builds the `level.create` payload for a freshly-resolved RobTop level, so
 * every entry point persists an identical snapshot.
 *
 * @param levelId - The GD level ID; the `levels` primary key.
 * @param gd - Normalized level from {@link fetchRobtopLevel}.
 * @param overrides - Fields to win over the RobTop values. Used by the GDDL
 * record sync, which falls back to GDDL's own metadata for `name` when RobTop
 * returns null (deleted/anonymized levels still present in GD's index).
 */
export function buildRobtopCreateData(
  levelId: string,
  gd: RobtopLevel,
  overrides: Partial<RobtopLevelFields> = {}
): Prisma.LevelUncheckedCreateInput {
  return { inGameId: levelId, ...robtopLevelFields(gd), ...overrides }
}

// Text fields whose null in a RobTop snapshot means "the response didn't carry
// it", never "the level's value is empty": key 2 is always populated for a live
// level, a creator absent from the response's creator list is an anonymized or
// deleted account rather than a nameless one, and every level has a song even
// when the song object is missing from the payload.
//
// This matters only when overwriting an existing row: the value already there
// may be the only one anyone has — a name from GDDL metadata (see
// {@link buildRobtopCreateData}'s `overrides`), a creator/song typed in by hand
// on a manual level. Writing null over it trades real metadata for nothing, and
// nothing re-derives it later. Omitting the key from an update payload leaves
// the column as-is, which is the same "freeze the last-known value" rule the
// level sync applies to delisted levels. Creates have nothing to preserve, so
// this applies to the refresh payload only.
const PRESERVE_IF_NULL = [
  'name',
  'creator',
  'songName',
  'songAuthor',
] as const satisfies readonly (keyof RobtopLevelFields)[]

/**
 * Builds the `level.update` payload that upgrades an existing stub row — one
 * created by an import or a GDDL sync that couldn't reach RobTop at the time —
 * to a full, verified snapshot.
 *
 * Unlike {@link buildRobtopCreateData} this stamps `lastCheckedAt`: the caller
 * just heard from RobTop, which is precisely what that column records. Three
 * of the copies this replaced set it and one (the GDDL list sync) did not,
 * leaving rows it upgraded reporting a stale "frozen as of" date on the level
 * page. Stamping it everywhere is the fix.
 *
 * Fields the snapshot reports as null that RobTop only ever nulls when it
 * couldn't tell us (see PRESERVE_IF_NULL) are omitted, so the row keeps
 * whatever it already had rather than being blanked.
 */
export function buildRobtopRefreshData(
  gd: RobtopLevel
): Prisma.LevelUncheckedUpdateInput {
  const fields: RobtopLevelFields = robtopLevelFields(gd)
  for (const key of PRESERVE_IF_NULL) {
    if (fields[key] === null) delete fields[key]
  }
  return { ...fields, lastCheckedAt: new Date() }
}
