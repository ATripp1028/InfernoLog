// Shared "check Song File Hub, persist the result to the levels cache" step,
// used by BOTH the /resolve endpoint and the RobTop sync jobs so the write
// behavior stays identical in both places.
//
// Write behavior (per EXTERNAL_APIS.md):
//   - found  → isNong = true, all sfh* fields, sfhCheckedAt = now()
//   - empty  → isNong = false, sfhCheckedAt = now() (a real "checked, none")
//   - failed → nothing written; sfhCheckedAt stays null so it retries later
//
// Never throws — a broken SFH must never turn into a 500 or a failed batch.

import prisma from '../../utils/prisma'
import { fetchSongFileHubNong } from '../../utils/songFileHub'
import { logger } from '../../utils/logger'

/**
 * The outcome of one SFH check, so callers (the sync loop) can tally results.
 *   'found'  → a NONG was found and cached
 *   'none'   → SFH answered but there's no NONG (cached as checked)
 *   'failed' → the call itself failed; nothing written, will retry
 */
export type SfhCheckOutcome = 'found' | 'none' | 'failed'

// Maps a level's rating status to the SFH catalog to query: a rated level's
// NONG lives under states=rated, an unrated level's under states=unrated.
const sfhStateFor = (isRated: boolean) => (isRated ? 'rated' : 'unrated')

/**
 * Re-check cadence. A level's song (and thus its NONG status) changing is
 * vanishingly rare, so a successful check is trusted for ~6 months before we
 * re-query. This is a cheap safety net — it eventually catches the rare case of
 * a NONG added/removed after our first check — not a live sync. A level whose
 * check never SUCCEEDED (sfhCheckedAt null) is exempt: it stays due every run
 * until one call succeeds, so a transient SFH outage doesn't cost 6 months.
 */
export const SFH_RECHECK_DAYS = 182

/**
 * Whether a level is due for an SFH check: never successfully checked, or last
 * checked longer ago than the re-check cadence.
 */
export function sfhCheckDue(sfhCheckedAt: Date | null): boolean {
  if (sfhCheckedAt === null) return true
  const cutoff = new Date(Date.now() - SFH_RECHECK_DAYS * 24 * 60 * 60 * 1000)
  return sfhCheckedAt < cutoff
}

/**
 * Fetches SFH for a level and persists the outcome. The caller is responsible
 * for the gating decision (skip if already isNong / delisted / already checked);
 * this runs the check unconditionally and writes the result. `isRated` selects
 * which SFH catalog to query (rated vs unrated).
 */
export async function checkAndPersistSfhNong(
  levelId: string,
  isRated: boolean
): Promise<SfhCheckOutcome> {
  const result = await fetchSongFileHubNong(levelId, sfhStateFor(isRated))

  // Call failed (network/timeout/non-2xx) — leave sfhCheckedAt null so the sync
  // job's retry filter picks it up again. Do NOT set isNong.
  if (result === undefined) return 'failed'

  const now = new Date()

  // Checked, no NONG — a valid cacheable result.
  if (result === null) {
    await prisma.level.update({
      where: { inGameId: levelId },
      data: { isNong: false, sfhCheckedAt: now },
    })
    return 'none'
  }

  // NONG found — cache SFH's song metadata. The result keys map 1:1 to the
  // sfh* columns.
  await prisma.level.update({
    where: { inGameId: levelId },
    data: { isNong: true, sfhCheckedAt: now, ...result },
  })
  return 'found'
}

/**
 * Gated variant for the /resolve endpoint: runs the check only for a level that
 * is due (never successfully checked, or last checked past the re-check
 * cadence) and isn't delisted. Best-effort; never throws.
 */
export async function checkSfhNongIfDue(levelId: string): Promise<void> {
  try {
    const row = await prisma.level.findUnique({
      where: { inGameId: levelId },
      select: { isRated: true, sfhCheckedAt: true, delistedAt: true },
    })
    if (!row) return
    if (row.delistedAt !== null || !sfhCheckDue(row.sfhCheckedAt)) return
    await checkAndPersistSfhNong(levelId, row.isRated)
  } catch (err) {
    // Swallow everything so a resolve response can never fail on the SFH step —
    // fetchSongFileHubNong already handles SFH outages, and this also guards the
    // cache write. sfhCheckedAt is left null so the sync job retries.
    logger.warn({ levelId, err }, 'checkSfhNongIfDue: failed (non-fatal)')
  }
}
