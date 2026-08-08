// STANDING repair tool for cached `levels` rows that never received a full
// RobTop snapshot — the "missing coins / featureScore / length" rows.
//
// Not a one-off: `--dry-run` is a cheap health check safe to run against prod
// any time, and the repair pass is idempotent, so this is the thing to reach
// for whenever level data looks blank in the UI.
//
// The level-cache sync now repairs unverified rows on its own (see the
// `repaired` branch in services/levels/sync.ts), so this is no longer the ONLY
// way out — but that sweep is a round-robin doing SYNC_SLICE_SIZE levels every
// 6 hours, so a row can wait a full lap of the cache to be reached. This script
// is how you fix a known-bad set now instead of eventually, and how you get a
// count of the damage without waiting at all.
//
// Background: several write paths create a level row WITHOUT calling RobTop.
// The GDDL submission sync is the big one (services/gddl/sync.ts,
// getOrCreateLevel): on a cache miss it calls fetchRobtopLevel, and on null
// falls back to creating a name-only stub (dataSource='manual',
// verified=false). fetchRobtopLevel returns null for "GD is unreachable" too —
// and once RobTop 429s, acquireRobtopSlot returns false IMMEDIATELY for the
// whole cooldown (60s–5min), so a single bulk GDDL import that trips the rate
// limit turns every remaining cache-miss level into a stub in one burst. The
// spreadsheet import (ensureStubLevels) creates the same kind of stub by
// design, relying on the seed queue to fill it in later.
//
// Those stubs do NOT self-heal:
//   - the seed queue is best-effort (a no-op when LEVEL_SEED_QUEUE_URL is
//     unset, which it was for the GDDL worker until the queue was wired up),
//     and levelSeedWorker used to treat an unreachable RobTop as terminal —
//     logging "stub retained" and never revisiting. Both are now fixed (the
//     worker fails the batch for SQS redrive, and the GDDL sync distinguishes
//     not-found from unreachable), so new damage of this shape should be rare;
//     this script is what repairs the rows already in that state, plus any that
//     slip past the DLQ.
//   - the round-robin level sync (services/levels/sync.ts) DID visit them and
//     make things worse: its diff only overwrote name, creator, songName,
//     songAuthor, isRated and inGameDifficulty, so the row acquired a real
//     name, creator, difficulty and a fresh lastCheckedAt — looking healthy —
//     while every extended-metadata column (length, coins, coinsVerified,
//     featureScore, featured, epicValue, stars, downloads, likes, objectCount,
//     description, partialDiff, levelVersion, gameVersion, song*) stayed null.
//     That sweep now rewrites a full snapshot for any unverified row, so it
//     heals rather than disguises — but only when the rotation reaches the row.
//
// This script closes that gap: it re-fetches each affected level from RobTop
// and writes the SAME full snapshot every healthy path writes
// (buildRobtopRefreshData), which also flips the row to
// dataSource='robtop_autofill' / verified=true.
//
// Scope (non-official, non-delisted rows only — getGJLevels21 never returns
// official levels, and a delisted row is deliberately frozen):
//   stubs   → verified=false. Definitionally never snapshotted: `verified` is
//             set true only by robtopLevelFields. Always in scope.
//   partial → verified=true but missing partialDiff / length / coins /
//             featureScore. Catches rows written by an older, drifted copy of
//             the field list. Skipped with --stubs-only.
//
// Idempotent: a repaired row is verified with a full snapshot, so it drops out
// of scope. Safe to re-run to mop up levels that were unreachable last time.
// NOTE: RobTop legitimately returns no coins/featureScore for some levels, so a
// handful of `partial` rows can stay in scope forever — the final summary
// reports how many were refreshed but still have those columns null, which is
// how you tell a real RobTop null from unrepaired damage.
//
// Usage (from apps/api), connection string from the root .env via dotenv-cli:
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillLevelMetadata.ts dev  [--dry-run] [--stubs-only] [--limit 200] [--pace 670]
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillLevelMetadata.ts prod [--dry-run] [--stubs-only] [--limit 200] [--pace 670]
//
//   dev → DATABASE_URL   prod → PROD_DATABASE_URL
//
// --dry-run      report the backlog (stubs vs partial, and which columns are
//                null) and exit; no RobTop calls, no writes.
// --stubs-only   only verified=false rows; skip the partial-metadata sweep.
// --limit <n>    process at most n rows this run (ordered by inGameId). Use to
//                take a first bite out of a large backlog without a long run.
// --pace <ms>    delay between RobTop calls (default 670, matching the sync).

// Mark this file as a module so its top-level names don't collide in the global
// scope with the other tsx scripts (all use dynamic import() rather than
// top-level imports, which would otherwise leave them as global scripts).
export {}

const args = process.argv.slice(2)
const target = args[0]
const dryRun = args.includes('--dry-run')
const stubsOnly = args.includes('--stubs-only')

function flagValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

const paceRaw = flagValue('--pace')
const paceMs = paceRaw !== undefined ? Number(paceRaw) : 670
const limitRaw = flagValue('--limit')
const limit = limitRaw !== undefined ? Number(limitRaw) : undefined

if (target !== 'dev' && target !== 'prod') {
  console.error(
    'Usage: backfillLevelMetadata.ts <dev|prod> [--dry-run] [--stubs-only] [--limit <n>] [--pace <ms>]\n' +
      `  got target=${JSON.stringify(target)}`
  )
  process.exit(1)
}
if (!Number.isFinite(paceMs) || paceMs < 0) {
  console.error(`Invalid --pace value: ${JSON.stringify(paceRaw)}`)
  process.exit(1)
}
if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
  console.error(`Invalid --limit value: ${JSON.stringify(limitRaw)}`)
  process.exit(1)
}

// Point the shared Prisma client at the target BEFORE importing anything that
// reads DATABASE_URL (utils/prisma binds the connection at import time).
const connectionString =
  target === 'prod' ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL

if (!connectionString) {
  const varName = target === 'prod' ? 'PROD_DATABASE_URL' : 'DATABASE_URL'
  console.error(
    `${varName} is not set. Run with the root .env loaded, e.g.\n` +
      `  pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillLevelMetadata.ts ${target}`
  )
  process.exit(1)
}
process.env.DATABASE_URL = connectionString

function maskHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '<unparseable connection string>'
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Consecutive unreachable results that abort the run. An active RobTop cooldown
// makes acquireRobtopSlot return false INSTANTLY rather than waiting, so without
// this the script would tear through the entire backlog in seconds, repairing
// nothing and reporting a pile of failures. Aborting early keeps the run
// honest — re-run once the cooldown has cleared.
const UNREACHABLE_ABORT_STREAK = 8

async function main() {
  const { default: prisma } = await import('../utils/prisma')
  const { fetchRobtopLevelResult } = await import('../utils/robtop')
  const { buildRobtopRefreshData } = await import(
    '../services/levels/robtopMapping'
  )

  console.log(
    `Level metadata backfill → target=${target} host=${maskHost(connectionString!)} ` +
      `dryRun=${dryRun} stubsOnly=${stubsOnly} paceMs=${paceMs}` +
      (limit !== undefined ? ` limit=${limit}` : '')
  )

  // Official rows are seeded from src/data/officialLevels.ts and are NEVER
  // returned by getGJLevels21 — re-fetching one always looks like a not-found.
  // Delisted rows are deliberately frozen at their last-known values; the
  // sync's reverify pass owns bringing those back.
  const baseWhere = {
    dataSource: { not: 'official' },
    delistedAt: null,
  } as const

  // `verified` is set true only by robtopLevelFields, so verified=false is the
  // exact set of rows that never received a full snapshot.
  const damagedWhere = stubsOnly
    ? { ...baseWhere, verified: false }
    : {
        ...baseWhere,
        OR: [
          { verified: false },
          // A found level always yields a partialDiff and a length; either
          // being null on a "verified" row means a drifted writer skipped it.
          { partialDiff: null },
          { length: null },
          { coins: null },
          { featureScore: null },
        ],
      }

  const rows = await prisma.level.findMany({
    where: damagedWhere,
    select: {
      inGameId: true,
      name: true,
      verified: true,
      dataSource: true,
      partialDiff: true,
      length: true,
      coins: true,
      featureScore: true,
    },
    orderBy: { inGameId: 'asc' },
    ...(limit !== undefined ? { take: limit } : {}),
  })

  const stubs = rows.filter((r) => !r.verified)
  const partial = rows.filter((r) => r.verified)

  console.log(
    `Rows in scope: ${rows.length} (stubs=${stubs.length}, partial=${partial.length})\n` +
      `  null length=${rows.filter((r) => r.length === null).length} ` +
      `coins=${rows.filter((r) => r.coins === null).length} ` +
      `featureScore=${rows.filter((r) => r.featureScore === null).length} ` +
      `partialDiff=${rows.filter((r) => r.partialDiff === null).length}`
  )

  if (dryRun) {
    console.log(
      'Dry run — no RobTop calls, nothing written. On a real run each row is ' +
        're-fetched from RobTop and, when found, overwritten with a full ' +
        "snapshot (dataSource='robtop_autofill', verified=true)."
    )
    return
  }
  if (rows.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  let repaired = 0
  let notFound = 0
  let unreachable = 0
  // Repaired rows where RobTop itself had no coins / featureScore — these stay
  // null legitimately and will keep matching the `partial` filter on re-runs.
  let stillNullAfterRepair = 0
  let unreachableStreak = 0
  let aborted = false

  for (let i = 0; i < rows.length; i++) {
    const { inGameId } = rows[i]!
    if (i > 0 && paceMs > 0) await sleep(paceMs)

    const res = await fetchRobtopLevelResult(inGameId)

    if (res.status === 'found') {
      unreachableStreak = 0
      // The level is present, so any pending "missing" mark is stale — cleared
      // here for the same reason the sync's found path clears it. ratingStatusSince
      // is deliberately NOT stamped: filling in a blank row is not a rating change.
      await prisma.level.update({
        where: { inGameId },
        data: { ...buildRobtopRefreshData(res.level), missingSince: null },
      })
      repaired++
      if (res.level.coins === null || res.level.featureScore === null) {
        stillNullAfterRepair++
      }
    } else if (res.status === 'not_found') {
      // GD has no such level (a bad id, or one deleted since it was imported).
      // Left as-is: delisting is the sync's call, not this script's.
      unreachableStreak = 0
      notFound++
    } else {
      unreachable++
      unreachableStreak++
      if (unreachableStreak >= UNREACHABLE_ABORT_STREAK) {
        aborted = true
        console.error(
          `Aborting: ${unreachableStreak} consecutive unreachable results — ` +
            'RobTop is throttling us (or a shared cooldown is active). ' +
            `Processed ${i + 1}/${rows.length}; re-run later to continue.`
        )
        break
      }
    }

    const processed = i + 1
    if (processed % 50 === 0 || processed === rows.length) {
      console.log(
        `[${processed}/${rows.length}] repaired=${repaired} ` +
          `notFound=${notFound} unreachable=${unreachable}`
      )
    }
  }

  console.log(
    `Done${aborted ? ' (aborted early)' : ''}. repaired=${repaired} ` +
      `notFound=${notFound} unreachable=${unreachable}` +
      (stillNullAfterRepair > 0
        ? `\n${stillNullAfterRepair} repaired row(s) still have a null coins/featureScore — ` +
          'RobTop reports no value for those; that is not unrepaired damage.'
        : '') +
      (unreachable > 0
        ? `\n${unreachable} row(s) left untouched (RobTop unreachable); re-run to retry.`
        : '')
  )
}

main()
  .catch((err) => {
    console.error('Level metadata backfill failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    const { default: prisma } = await import('../utils/prisma')
    await prisma.$disconnect()
  })
