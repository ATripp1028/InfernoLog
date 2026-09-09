// One-off Global Stats Viewer (GSV) backfill for the shared `levels` cache.
//
// GSV data is normally populated lazily — on the first /resolve of a level, and
// by the GSV rotation the level-sync cron drives (runGsvSyncSlice). This script
// does the same check eagerly for the whole backlog so a freshly-shipped
// integration doesn't wait for the rotation to walk every cached level. It
// reuses the exact write path the cron uses (checkAndPersistGsv) so behaviour is
// identical: found → placements + object count + gsvCheckedAt, 404 → stamps
// gsvCheckedAt only, a failed call writes nothing (gsvCheckedAt stays null) so a
// later run — or the cron — retries it.
//
// Targets the same gate the rotation uses: rated, not delisted, and never
// successfully checked (gsvCheckedAt IS NULL). Unrated levels are excluded
// because GSV indexes rated levels only — they would 404 every run forever.
// Idempotent: a second run only revisits the rows still null (i.e. the failures).
//
// Usage (from apps/api). The DB is chosen by the first arg; the connection
// string comes from the root .env, loaded via dotenv-cli:
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillGsv.ts dev  [--dry-run] [--pace 300]
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillGsv.ts prod [--dry-run] [--pace 300]
//
//   dev  → uses DATABASE_URL       prod → uses PROD_DATABASE_URL
//
// --dry-run  count the eligible backlog and exit without calling GSV or writing.
// --pace <ms>  delay between GSV calls (default 300ms) — community-run API.

// Mark this file as a module so its top-level names don't collide in the global
// scope with the other tsx scripts (all use dynamic import() rather than
// top-level imports, which would otherwise leave them as global scripts).
export {}

const args = process.argv.slice(2)
const target = args[0]
const dryRun = args.includes('--dry-run')
const paceIdx = args.indexOf('--pace')
const paceMs = paceIdx !== -1 ? Number(args[paceIdx + 1]) : 300

if (target !== 'dev' && target !== 'prod') {
  console.error(
    'Usage: backfillGsv.ts <dev|prod> [--dry-run] [--pace <ms>]\n' +
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
// the connection at import time, so prisma + gsvSync are dynamically imported
// only after this assignment.
const connectionString =
  target === 'prod' ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL

if (!connectionString) {
  const varName = target === 'prod' ? 'PROD_DATABASE_URL' : 'DATABASE_URL'
  console.error(
    `${varName} is not set. Run with the root .env loaded, e.g.\n` +
      `  pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillGsv.ts ${target}`
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
  const { checkAndPersistGsv } = await import('../services/levels/gsvSync')

  console.log(
    `GSV backfill → target=${target} host=${maskHost(connectionString!)} ` +
      `dryRun=${dryRun} paceMs=${paceMs}`
  )

  // The GSV gate the rotation uses: never successfully checked, rated, not
  // delisted.
  const levels = await prisma.level.findMany({
    where: { gsvCheckedAt: null, delistedAt: null, isRated: true },
    select: { inGameId: true },
    orderBy: { inGameId: 'asc' },
  })

  console.log(
    `Eligible levels (gsvCheckedAt=null, rated, not delisted): ${levels.length}`
  )

  if (dryRun) {
    console.log('Dry run — no GSV calls made, nothing written.')
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

    // The GSV call itself never throws — it resolves to 'failed' and writes
    // nothing. The cache WRITE can still throw, though (the row deleted since
    // the findMany above, or a transient DB error), and this loop runs for
    // hours, so one such row must not abort the whole backfill. Tallied as a
    // failure, which leaves gsvCheckedAt null for a re-run to retry.
    let outcome: 'found' | 'none' | 'failed'
    try {
      outcome = await checkAndPersistGsv(inGameId)
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
        ? ` — ${failed} left gsvCheckedAt=null; re-run to retry (or the cron will).`
        : '')
  )
}

main()
  .catch((err) => {
    console.error('GSV backfill failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    const { default: prisma } = await import('../utils/prisma')
    await prisma.$disconnect()
  })
