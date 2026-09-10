// One-off community-list (GSV + GDDL + AREDL) backfill for the shared `levels`
// cache.
//
// This data is normally populated lazily — on the first /resolve of a level, and
// by the rotation the level-sync cron drives (runCommunitySyncSlice). This
// script does the same check eagerly for the whole backlog so a freshly-shipped
// integration doesn't wait for the rotation to walk every cached level. It
// reuses the exact write path the cron uses (checkAndPersistCommunity) so
// behaviour is identical: the per-source priority merge, communityCheckedAt
// stamped when at least one source answers, and nothing written at all when
// none does (leaving the level due for a later run — or the cron — to retry).
//
// Targets the same gate the rotation uses: not delisted, indexed by at least one
// source (rated for GSV, a demon for GDDL/AREDL), and never successfully checked
// (communityCheckedAt IS NULL). Idempotent: a second run only revisits the rows
// still null (i.e. the failures).
//
// Usage (from apps/api). The DB is chosen by the first arg; the connection
// string comes from the root .env, loaded via dotenv-cli:
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillCommunity.ts dev  [--dry-run] [--pace 700]
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillCommunity.ts prod [--dry-run] [--pace 700]
//
//   dev  → uses DATABASE_URL       prod → uses PROD_DATABASE_URL
//
// --dry-run  count the eligible backlog and exit without calling out or writing.
// --pace <ms>  delay between levels (default 700ms). Set by GDDL, the one source
//   that publishes a limit: 100 requests / 60s per IP.

// Mark this file as a module so its top-level names don't collide in the global
// scope with the other tsx scripts (all use dynamic import() rather than
// top-level imports, which would otherwise leave them as global scripts).
export {}

const args = process.argv.slice(2)
const target = args[0]
const dryRun = args.includes('--dry-run')
const paceIdx = args.indexOf('--pace')
const paceMs = paceIdx !== -1 ? Number(args[paceIdx + 1]) : 700

if (target !== 'dev' && target !== 'prod') {
  console.error(
    'Usage: backfillCommunity.ts <dev|prod> [--dry-run] [--pace <ms>]\n' +
      `  got target=${JSON.stringify(target)}`
  )
  process.exit(1)
}
if (!Number.isFinite(paceMs) || paceMs < 0) {
  console.error(`Invalid --pace value: ${JSON.stringify(args[paceIdx + 1])}`)
  process.exit(1)
}

// Pick the connection string for the target and point the shared Prisma client
// at it BEFORE importing anything that reads DATABASE_URL. utils/prisma binds
// the connection at import time, so prisma + communitySync are dynamically imported
// only after this assignment.
const connectionString =
  target === 'prod' ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL

if (!connectionString) {
  const varName = target === 'prod' ? 'PROD_DATABASE_URL' : 'DATABASE_URL'
  console.error(
    `${varName} is not set. Run with the root .env loaded, e.g.\n` +
      `  pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillCommunity.ts ${target}`
  )
  process.exit(1)
}
process.env.DATABASE_URL = connectionString

// Mask the host so the log shows which DB we hit without leaking credentials.
function maskHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '<unparseable connection string>'
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const { default: prisma } = await import('../utils/prisma')
  const { checkAndPersistCommunity } = await import(
    '../services/levels/communitySync'
  )

  console.log(
    `Community backfill → target=${target} host=${maskHost(connectionString!)} ` +
      `dryRun=${dryRun} paceMs=${paceMs}`
  )

  // The gate the rotation uses: never successfully checked, not delisted, and
  // indexed by at least one source.
  const levels = await prisma.level.findMany({
    where: {
      communityCheckedAt: null,
      delistedAt: null,
      OR: [{ isRated: true }, { isDemon: true }],
    },
    select: { inGameId: true },
    orderBy: { inGameId: 'asc' },
  })

  console.log(
    `Eligible levels (communityCheckedAt=null, rated or demon, not delisted): ${levels.length}`
  )

  if (dryRun) {
    console.log('Dry run — no calls made, nothing written.')
    return
  }
  if (levels.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  let found = 0
  let none = 0
  let failed = 0

  for (let i = 0; i < levels.length; i++) {
    const { inGameId } = levels[i]!
    if (i > 0 && paceMs > 0) await sleep(paceMs)

    // The source calls themselves never throw — a failed one resolves to
    // 'failed' and writes nothing. The cache WRITE can still throw, though (the
    // row deleted since the findMany above, or a transient DB error), and this
    // loop runs for hours, so one such row must not abort the whole backfill.
    // Tallied as a failure, which leaves communityCheckedAt null for a re-run.
    let outcome: 'found' | 'none' | 'failed'
    try {
      outcome = await checkAndPersistCommunity(inGameId)
    } catch (err) {
      console.error(`  ${inGameId}: write failed —`, err)
      outcome = 'failed'
    }
    if (outcome === 'found') found++
    else if (outcome === 'none') none++
    else failed++

    // Heartbeat every 50 so a long run is observable.
    const processed = i + 1
    if (processed % 50 === 0 || processed === levels.length) {
      console.log(
        `[${processed}/${levels.length}] found=${found} none=${none} failed=${failed}`
      )
    }
  }

  console.log(
    `Done. processed=${levels.length} found=${found} none=${none} failed=${failed}` +
      (failed > 0
        ? ` — ${failed} left communityCheckedAt=null; re-run to retry (or the cron will).`
        : '')
  )
}

main()
  .catch((err) => {
    console.error('Community backfill failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    const { default: prisma } = await import('../utils/prisma')
    await prisma.$disconnect()
  })
