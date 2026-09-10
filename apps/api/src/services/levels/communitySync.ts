// Shared "check the community lists, persist the result to the levels cache"
// step, used by the /resolve path, the level sync cron, and the backfill script
// so the write behavior stays identical everywhere.
//
// THREE SOURCES, ONE PASS. The Global Stats Viewer aggregates all three lists
// into one call, but it is lossy: AREDL carries a verification video for every
// placed level plus EDEL enjoyment and the NLW tier BY NAME (which is how tier
// 0 becomes reportable instead of inferred), and GDDL carries a showcase for
// essentially its whole corpus plus a measured duration. GSV remains the only
// source of a trustworthy object count and the fallback for everything else.
// They are fetched together, in parallel, because the priority rules below can
// only be applied with every source's opinion in hand at once.
//
// WHICH SOURCE WINS, per column:
//   showcaseUrl     AREDL → GSV → GDDL   (all normalized to a watch URL)
//   durationSeconds GDDL → GSV
//   gddlTier        GDDL → GSV
//   aredlRank       AREDL → GSV
//   sheetTier       AREDL → GSV
//   objectCount     GSV only, and only when GSV has one
//   aredlRank/Status AREDL only
//   enjoyment       AREDL (EDEL) for extremes, GDDL for everything else
//
// ENJOYMENT IS CHOSEN BY DIFFICULTY, NOT BY PRIORITY. It is the one column two
// sources feed where the winner is not "whoever answered first": an extreme
// demon takes EDEL's score and only EDEL's, everything at Insane and below
// takes GDDL's and only GDDL's. So exactly one source is consulted per level
// and the other is never a fallback — an extreme EDEL has not rated stores
// nothing, on the reasoning that a level absent from EDEL is unlikely to be
// rated on GDDL either. Which source that was is recoverable from the
// difficulty alone (isExtremeDemon), so it is derived at the display layer
// rather than stored.
//
// THE NO-DOWNGRADE RULE. Each source answers with a result, `null` ("I don't
// have this level" — authoritative and cacheable), or `undefined` (the call
// failed — NO OPINION AT ALL). For each column we walk its priority order: if
// the highest-priority applicable source did not ANSWER, the column is left
// exactly as it was; if it answered with nothing, we fall through to the next
// source. Without this a single AREDL timeout would rewrite showcaseUrl to
// GDDL's copy and rewrite it back on the next pass — and since the three emit
// different URL formats, every flap would be a real write and a visible change.
//
// Never throws — a broken community API must never turn into a 500 or a failed
// batch.

import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { fetchGlobalStatsViewerLevel } from '../../utils/globalStatsViewer'
import type { GlobalStatsViewerResult } from '../../utils/globalStatsViewer'
import { fetchGddlLevel } from '../../utils/gddl'
import type { GddlLevelResult } from '../../utils/gddl'
import { isExtremeDemon } from '@infernolog/core'
import { fetchAredlLevel } from '../../utils/aredl'
import type { AredlListEntry, AredlResult } from '../../utils/aredl'
import { logger } from '../../utils/logger'

/**
 * The outcome of one community check, so callers (the sync loop) can tally.
 *   'found'  → at least one source had the level; its data was cached
 *   'none'   → every applicable source answered, none had the level
 *   'failed' → no applicable source answered; nothing written, will retry
 */
export type CommunityCheckOutcome = 'found' | 'none' | 'failed'

/**
 * What a gated check did. Adds 'skipped' to {@link CommunityCheckOutcome} for a
 * level that wasn't due, applies to no source, or is delisted — no HTTP call
 * was made, which is what lets the batch helper below pace only real requests.
 */
export type CommunityGatedOutcome = CommunityCheckOutcome | 'skipped'

/**
 * Re-check cadence. List placements move — GDDL tiers especially — so this is
 * far shorter than the Song File Hub window. In practice it is rarely the
 * binding constraint: how fast the sync's round-robin walks the cache is (see
 * runCommunitySyncSlice). A level whose check never SUCCEEDED
 * (communityCheckedAt null) is exempt and stays due every run.
 */
export const COMMUNITY_RECHECK_DAYS = 7

/**
 * How soon a level comes back around after a pass where some — but not all —
 * of its applicable sources failed. Such a pass still writes what it learned
 * and still stamps a timestamp, but backdates it to this distance from the full
 * cadence.
 *
 * The alternative, withholding the stamp entirely, is what a "retry until
 * perfect" rule would do, and it is a trap: GDDL applies to every demon in the
 * cache and is the one source with a hard rate limit, so a throttled run would
 * leave all of those rows permanently in the eligible set, the lap would never
 * shorten, and the next run would hit GDDL just as hard. Backdating is the same
 * intent with a floor under it.
 */
export const PARTIAL_RETRY_HOURS = 6

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether a level is due for a community check: never successfully checked, or
 * last checked longer ago than the re-check cadence.
 */
export function communityCheckDue(communityCheckedAt: Date | null): boolean {
  if (communityCheckedAt === null) return true
  return communityCheckedAt < new Date(Date.now() - COMMUNITY_RECHECK_DAYS * DAY_MS)
}

/** The level fields that decide which sources apply to it. */
interface CommunityGateFields {
  isRated: boolean
  isDemon: boolean
  /** Read only to choose the enjoyment source — see the header. */
  partialDiff: string | null
  inGameDifficulty: string | null
}

/**
 * Which sources index this level at all.
 *
 * GSV carries rated levels; GDDL is a demon ladder; AREDL lists extreme demons
 * plus, in its Legacy tier, the levels demoted out of extreme — which is why
 * this is `isDemon` and NOT a difficulty test. `partialDiff` equality would be
 * wrong twice over: it has a `demon-extreme-featured` variant, and predicting
 * AREDL membership from difficulty is exactly what the Legacy tier defeats. A
 * demon AREDL doesn't carry costs one 404 that is then cached.
 */
function applicableSources(level: CommunityGateFields) {
  return {
    gsv: level.isRated,
    gddl: level.isDemon,
    aredl: level.isDemon,
  }
}

// A source's answer for one pass. `undefined` is the important one: it means
// the source said nothing, which is different from saying "nothing".
type Answer<T> = T | null | undefined

interface Answers {
  gsv: Answer<GlobalStatsViewerResult>
  gddl: Answer<GddlLevelResult>
  aredl: Answer<AredlResult>
}

/**
 * Resolves one column against the no-downgrade rule.
 *
 * @param candidates - Each applicable source's answer for this column, in
 *   priority order, as `[answered, value]`. A source that did not answer stops
 *   the walk; a source that answered with null falls through to the next.
 * @returns `[write, value]` — `write: false` means leave the column alone.
 */
function resolveField<T>(
  candidates: readonly (readonly [boolean, T | null])[]
): readonly [boolean, T | null] {
  for (const [answered, value] of candidates) {
    // The highest-priority source still in the running had no opinion, so we
    // cannot know whether a lower-priority value would be a downgrade. Leave
    // the column as it stands and try again next pass.
    if (!answered) return [false, null]
    if (value !== null) return [true, value]
  }
  // Every source in the list answered and none had a value: that IS an answer.
  return [true, null]
}

/**
 * Merges the three sources' answers into the columns they feed, applying the
 * priority table and the no-downgrade rule at the top of this module.
 *
 * Exported for its own unit tests — the priority table is the part of this
 * change most likely to rot silently, since a wrong precedence still produces
 * a plausible-looking level page.
 *
 * @param answers - What each source said this pass.
 * @param applies - Which sources index this level (see applicableSources).
 * @returns The columns to write. Omitted keys are deliberately left untouched.
 */
export function mergeCommunityData(
  answers: Answers,
  applies: { gsv: boolean; gddl: boolean; aredl: boolean },
  level: CommunityGateFields
): Prisma.LevelUncheckedUpdateInput {
  // `[answered, value]` per source per column. A source that doesn't apply is
  // omitted from the walk entirely rather than counted as silent — an unrated
  // level is not waiting on GSV to have an opinion about it.
  const gsvAnswered = applies.gsv && answers.gsv !== undefined
  const gddlAnswered = applies.gddl && answers.gddl !== undefined
  const aredlAnswered = applies.aredl && answers.aredl !== undefined

  const gsv = answers.gsv ?? null
  const gddl = answers.gddl ?? null
  const aredl = answers.aredl ?? null

  const from = <T>(
    applicable: boolean,
    answered: boolean,
    value: T | null | undefined
  ): readonly [boolean, T | null][] =>
    applicable ? [[answered, value ?? null] as const] : []

  const data: Prisma.LevelUncheckedUpdateInput = {}
  const put = <T>(
    key: keyof Prisma.LevelUncheckedUpdateInput,
    candidates: readonly (readonly [boolean, T | null])[]
  ) => {
    if (candidates.length === 0) return
    const [write, value] = resolveField(candidates)
    if (write) (data as Record<string, unknown>)[key] = value
  }

  put('showcaseUrl', [
    ...from(applies.aredl, aredlAnswered, aredl?.showcaseUrl),
    ...from(applies.gsv, gsvAnswered, gsv?.showcaseUrl),
    ...from(applies.gddl, gddlAnswered, gddl?.showcaseUrl),
  ])
  put('durationSeconds', [
    ...from(applies.gddl, gddlAnswered, gddl?.seconds),
    ...from(applies.gsv, gsvAnswered, gsv?.durationSeconds),
  ])
  put('gddlTier', [
    ...from(applies.gddl, gddlAnswered, gddl?.tier),
    ...from(applies.gsv, gsvAnswered, gsv?.gddlTier),
  ])
  put('aredlRank', [
    ...from(applies.aredl, aredlAnswered, aredl?.position),
    ...from(applies.gsv, gsvAnswered, gsv?.aredlRank),
  ])
  put('sheetTier', [
    ...from(applies.aredl, aredlAnswered, aredl?.sheetTier),
    ...from(applies.gsv, gsvAnswered, gsv?.sheetTier),
  ])
  put('aredlStatus', from(applies.aredl, aredlAnswered, aredl?.status))

  // One source, picked by difficulty — never a fallback to the other. See the
  // module header for why an extreme EDEL hasn't rated stores nothing.
  if (isExtremeDemon(level)) {
    put('enjoyment', from(applies.aredl, aredlAnswered, aredl?.enjoyment))
    put(
      'enjoymentPending',
      from(applies.aredl, aredlAnswered, aredl?.enjoymentPending)
    )
  } else {
    put('enjoyment', from(applies.gddl, gddlAnswered, gddl?.enjoyment))
    // Only EDEL publishes a provisional flag, so a GDDL score clears it rather
    // than inheriting whatever a previous difficulty left behind.
    put('enjoymentPending', from(applies.gddl, gddlAnswered, null))
  }

  // GSV's object count supersedes RobTop's (which is 65535 over the object
  // limit and 0/null on older levels) — but only when GSV actually has one.
  // Writing a null here would erase the RobTop value for no gain, so this one
  // column does NOT follow the rule above.
  if (gsvAnswered && gsv?.objectCount != null) {
    data.objectCount = gsv.objectCount
  }

  return data
}

// Fetches every applicable source at once. Three different hosts, so the wall
// clock is the slowest of the three rather than their sum.
async function fetchAll(
  levelId: string,
  applies: { gsv: boolean; gddl: boolean; aredl: boolean },
  aredlList?: Map<string, AredlListEntry>
): Promise<Answers> {
  // When the caller holds the bulk AREDL list (the cron does), it already knows
  // whether this level is on the list, so a non-member costs no request at all.
  // A member still gets the per-level call: the bulk payload carries no
  // verifications, and the showcase is the whole reason to make it.
  const aredlApplies =
    applies.aredl && (aredlList === undefined || aredlList.has(levelId))

  const [gsv, gddl, aredl] = await Promise.all([
    applies.gsv ? fetchGlobalStatsViewerLevel(levelId) : undefined,
    applies.gddl ? fetchGddlLevel(levelId) : undefined,
    aredlApplies ? fetchAredlLevel(levelId) : undefined,
  ])

  // A level the bulk list says is not on AREDL: that is an ANSWER (a cached
  // 404's worth of information), not a silent source, so the merge is free to
  // clear a stale placement.
  if (applies.aredl && !aredlApplies) {
    return { gsv, gddl, aredl: null }
  }
  return { gsv, gddl, aredl }
}

/**
 * Fetches every applicable community source for a level and persists the merged
 * outcome. The caller owns the gating decision (skip if delisted / already
 * checked recently); this runs the check unconditionally and writes the result.
 *
 * @param levelId - The GD level id.
 * @param aredlList - The bulk AREDL list, when the caller has one, used as a
 *   membership oracle so non-members cost no AREDL request.
 */
export async function checkAndPersistCommunity(
  levelId: string,
  aredlList?: Map<string, AredlListEntry>
): Promise<CommunityCheckOutcome> {
  const row = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select: {
      isRated: true,
      isDemon: true,
      partialDiff: true,
      inGameDifficulty: true,
    },
  })
  if (!row) return 'failed'

  const applies = applicableSources(row)
  if (!applies.gsv && !applies.gddl && !applies.aredl) return 'none'

  const answers = await fetchAll(levelId, applies, aredlList)

  const answered = [
    applies.gsv && answers.gsv !== undefined,
    applies.gddl && answers.gddl !== undefined,
    applies.aredl && answers.aredl !== undefined,
  ]
  const answeredCount = answered.filter(Boolean).length
  const applicableCount = [applies.gsv, applies.gddl, applies.aredl].filter(
    Boolean
  ).length

  // Nothing answered — write nothing at all and leave communityCheckedAt as it
  // was, so the rotation's retry filter picks the level up again.
  if (answeredCount === 0) return 'failed'

  const data = mergeCommunityData(answers, applies, row)

  // A partial pass is a freshness event, not a data-loss one: the no-downgrade
  // rule already protected every column whose source went quiet. Stamp it, but
  // backdate so it returns in hours rather than a full cadence.
  data.communityCheckedAt =
    answeredCount === applicableCount
      ? new Date()
      : new Date(
          Date.now() - (COMMUNITY_RECHECK_DAYS * 24 - PARTIAL_RETRY_HOURS) * 60 * 60 * 1000
        )

  await prisma.level.update({ where: { inGameId: levelId }, data })

  const found =
    (answers.gsv ?? null) !== null ||
    (answers.gddl ?? null) !== null ||
    (answers.aredl ?? null) !== null
  return found ? 'found' : 'none'
}

/**
 * Gated variant for the /resolve path: runs the check only for a level that is
 * due and not delisted. Best-effort; never throws.
 *
 * A level that applies to no source (unrated, not a demon) is skipped rather
 * than checked — it would 404 on every pass forever. One that later gets rated
 * is picked up anyway, because its communityCheckedAt ages past the cadence.
 */
export async function checkCommunityIfDue(
  levelId: string,
  aredlList?: Map<string, AredlListEntry>
): Promise<CommunityGatedOutcome> {
  try {
    const row = await prisma.level.findUnique({
      where: { inGameId: levelId },
      select: {
        isRated: true,
        isDemon: true,
        partialDiff: true,
        inGameDifficulty: true,
        communityCheckedAt: true,
        delistedAt: true,
      },
    })
    if (!row) return 'skipped'
    if (row.delistedAt !== null) return 'skipped'
    const applies = applicableSources(row)
    if (!applies.gsv && !applies.gddl && !applies.aredl) return 'skipped'
    if (!communityCheckDue(row.communityCheckedAt)) return 'skipped'
    return await checkAndPersistCommunity(levelId, aredlList)
  } catch (err) {
    // Swallow everything so a caller can never fail on the community step.
    logger.warn({ levelId, err }, 'checkCommunityIfDue: failed (non-fatal)')
    return 'failed'
  }
}

// Pacing between checks in a batch. Set by GDDL, the only one of the three that
// publishes a limit (100 requests / 60s per IP — a 600ms floor). The other two
// ride along for free, since a level's three calls go out in parallel.
const SEED_PACE_MS = 700

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs the gated community check across levels that were just seeded from
 * RobTop, so a newly-cached level carries its community-list placements
 * immediately instead of waiting for the cron rotation to reach it.
 *
 * **Call this AFTER any transaction has committed, never inside one** — these
 * are outbound HTTP calls, and holding a Postgres transaction open across them
 * is how a bulk import turns into lock contention.
 *
 * Paced, but only between calls that actually went out: a batch of levels that
 * were already checked costs one indexed read each and no delay at all, which
 * is what keeps a re-import of a known library fast.
 *
 * Never throws — seeding must not fail because a community list is having a
 * bad day.
 *
 * @param budgetMs - Wall-clock ceiling on the whole batch. **Every caller on a
 * clock should pass one.** A batch is otherwise unbounded: one level can take
 * the full fetch timeout (5s) when a source hangs, so 50 seeded levels is over
 * four minutes — long enough to blow a route's Lambda timeout, or to eat the
 * import worker's self-reinvoke margin and strand a job at `running`. Levels
 * past the budget are simply left for the cron rotation, which is where they
 * would have been served from anyway. Omit only where the batch is small and
 * the caller has minutes to spare (the seed worker's 8 ids).
 */
export async function checkCommunityForSeededLevels(
  levelIds: readonly string[],
  budgetMs?: number
): Promise<void> {
  const deadline =
    budgetMs === undefined ? Infinity : Date.now() + Math.max(0, budgetMs)
  let called = false
  let skippedForBudget = 0
  for (const levelId of levelIds) {
    if (Date.now() >= deadline) {
      skippedForBudget++
      continue
    }
    if (called) await sleep(SEED_PACE_MS)
    const outcome = await checkCommunityIfDue(levelId)
    called = outcome !== 'skipped'
  }
  if (skippedForBudget > 0) {
    logger.warn(
      { skipped: skippedForBudget, total: levelIds.length, budgetMs },
      'checkCommunityForSeededLevels: budget exhausted, leaving the rest to the cron'
    )
  }
}
