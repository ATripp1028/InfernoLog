// Official Geometry Dash levels (main soundtrack + Meltdown / World / SubZero).
//
// These are NOT served by RobTop's getGJLevels21, so they can never enter the
// cache via autofill — we seed them manually so they show up in name search and
// resolve as cache hits. Keyed by a synthetic sequential `inGameId` (1–38), all
// confirmed to return "-1" on the live server (no collision with real levels).
//
// Names and song data come from GDBrowser's misc/music.json (authoritative).
// ⚠️ DIFFICULTY and STARS are best-effort and NEED VERIFICATION — especially the
// three demon tiers (Clubstep / Theory of Everything 2 / Deadlocked), the
// spin-off packs, and Dash. Correct them here, then re-run the seed.
//
// `officialSongId` is the raw key-12 index into OFFICIAL_SONGS (utils/robtop.ts);
// the seed derives songName/songAuthor from it. Dash isn't in that map, so its
// song is set inline.

export interface OfficialLevel {
  inGameId: string
  name: string
  inGameDifficulty: string
  isDemon: boolean
  stars: number
  length: string
  // Index into OFFICIAL_SONGS; null when not in that map (Dash).
  officialSongId: number | null
  // Song override when not derivable from officialSongId.
  songName?: string
  songAuthor?: string
}

export const OFFICIAL_LEVELS: OfficialLevel[] = [
  // ── Main levels (1–22) ────────────────────────────────────────────────────
  { inGameId: '1', name: 'Stereo Madness', inGameDifficulty: 'Easy', isDemon: false, stars: 1, length: 'Long', officialSongId: 0 },
  { inGameId: '2', name: 'Back On Track', inGameDifficulty: 'Easy', isDemon: false, stars: 2, length: 'Long', officialSongId: 1 },
  { inGameId: '3', name: 'Polargeist', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Long', officialSongId: 2 },
  { inGameId: '4', name: 'Dry Out', inGameDifficulty: 'Normal', isDemon: false, stars: 4, length: 'Long', officialSongId: 3 },
  { inGameId: '5', name: 'Base After Base', inGameDifficulty: 'Hard', isDemon: false, stars: 5, length: 'Long', officialSongId: 4 },
  { inGameId: '6', name: "Can't Let Go", inGameDifficulty: 'Hard', isDemon: false, stars: 6, length: 'Long', officialSongId: 5 },
  { inGameId: '7', name: 'Jumper', inGameDifficulty: 'Harder', isDemon: false, stars: 7, length: 'Long', officialSongId: 6 },
  { inGameId: '8', name: 'Time Machine', inGameDifficulty: 'Harder', isDemon: false, stars: 8, length: 'Long', officialSongId: 7 },
  { inGameId: '9', name: 'Cycles', inGameDifficulty: 'Harder', isDemon: false, stars: 9, length: 'Long', officialSongId: 8 },
  { inGameId: '10', name: 'xStep', inGameDifficulty: 'Insane', isDemon: false, stars: 10, length: 'Long', officialSongId: 9 },
  { inGameId: '11', name: 'Clutterfunk', inGameDifficulty: 'Insane', isDemon: false, stars: 11, length: 'Long', officialSongId: 10 },
  { inGameId: '12', name: 'Theory of Everything', inGameDifficulty: 'Insane', isDemon: false, stars: 12, length: 'Long', officialSongId: 11 },
  { inGameId: '13', name: 'Electroman Adventures', inGameDifficulty: 'Insane', isDemon: false, stars: 10, length: 'Long', officialSongId: 12 },
  { inGameId: '14', name: 'Clubstep', inGameDifficulty: 'Easy Demon', isDemon: true, stars: 14, length: 'Long', officialSongId: 13 },
  { inGameId: '15', name: 'Electrodynamix', inGameDifficulty: 'Insane', isDemon: false, stars: 12, length: 'Long', officialSongId: 14 },
  { inGameId: '16', name: 'Hexagon Force', inGameDifficulty: 'Insane', isDemon: false, stars: 12, length: 'Long', officialSongId: 15 },
  { inGameId: '17', name: 'Blast Processing', inGameDifficulty: 'Harder', isDemon: false, stars: 10, length: 'Long', officialSongId: 16 },
  { inGameId: '18', name: 'Theory of Everything 2', inGameDifficulty: 'Easy Demon', isDemon: true, stars: 14, length: 'Long', officialSongId: 17 },
  { inGameId: '19', name: 'Geometrical Dominator', inGameDifficulty: 'Harder', isDemon: false, stars: 10, length: 'Long', officialSongId: 18 },
  { inGameId: '20', name: 'Deadlocked', inGameDifficulty: 'Easy Demon', isDemon: true, stars: 15, length: 'Long', officialSongId: 19 },
  { inGameId: '21', name: 'Fingerdash', inGameDifficulty: 'Insane', isDemon: false, stars: 12, length: 'Long', officialSongId: 20 },
  { inGameId: '22', name: 'Dash', inGameDifficulty: 'Insane', isDemon: false, stars: 12, length: 'Long', officialSongId: 38 },

  // ── Meltdown (23–25) ──────────────────────────────────────────────────────
  { inGameId: '23', name: 'The Seven Seas', inGameDifficulty: 'Easy', isDemon: false, stars: 1, length: 'Long', officialSongId: 21 },
  { inGameId: '24', name: 'Viking Arena', inGameDifficulty: 'Normal', isDemon: false, stars: 2, length: 'Long', officialSongId: 22 },
  { inGameId: '25', name: 'Airborne Robots', inGameDifficulty: 'Hard', isDemon: false, stars: 3, length: 'Long', officialSongId: 23 },

  // ── GD World (26–35) ──────────────────────────────────────────────────────
  { inGameId: '26', name: 'Payload', inGameDifficulty: 'Easy', isDemon: false, stars: 2, length: 'Short', officialSongId: 25 },
  { inGameId: '27', name: 'Beast Mode', inGameDifficulty: 'Easy', isDemon: false, stars: 2, length: 'Short', officialSongId: 26 },
  { inGameId: '28', name: 'Machina', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 27 },
  { inGameId: '29', name: 'Years', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 28 },
  { inGameId: '30', name: 'Frontlines', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 29 },
  { inGameId: '31', name: 'Space Pirates', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 30 },
  { inGameId: '32', name: 'Striker', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 31 },
  { inGameId: '33', name: 'Embers', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 32 },
  { inGameId: '34', name: 'Round 1', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 33 },
  { inGameId: '35', name: 'Monster Dance Off', inGameDifficulty: 'Normal', isDemon: false, stars: 3, length: 'Short', officialSongId: 34 },

  // ── SubZero (36–38) ───────────────────────────────────────────────────────
  { inGameId: '36', name: 'Press Start', inGameDifficulty: 'Normal', isDemon: false, stars: 4, length: 'Long', officialSongId: 35 },
  { inGameId: '37', name: 'Nock Em', inGameDifficulty: 'Hard', isDemon: false, stars: 6, length: 'Long', officialSongId: 36 },
  { inGameId: '38', name: 'Power Trip', inGameDifficulty: 'Harder', isDemon: false, stars: 8, length: 'Long', officialSongId: 37 },
]
