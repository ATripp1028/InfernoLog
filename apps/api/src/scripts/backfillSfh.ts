// One-off Song File Hub (SFH) NONG backfill for the shared `levels` cache.
//
// SFH data is normally populated lazily — on /resolve and /page for a due level,
// and opportunistically by the weekly/monthly RobTop sync jobs (which fold in a
// check for any level with sfhCheckedAt = null). This script does the same check
// eagerly for the whole backlog so we don't wait up to a month for the crons to
// walk every level. It reuses the exact write path the sync uses
// (checkAndPersistSfhNong) so behaviour is identical: found → isNong + sfh*
// fields, none → isNong=false, both stamp sfhCheckedAt; a failed SFH call writes
// nothing (sfhCheckedAt stays null) so a later run — or the cron — retries it.
//
// Targets: only levels that have NEVER been successfully checked
// (sfhCheckedAt IS NULL) and are not delisted (matching the sync's SFH gate).
// Idempotent: a second run only revisits the rows still null (i.e. the failures).
//
// Usage (from apps/api). The DB is chosen by the first arg; the connection
// string comes from the root .env, loaded via dotenv-cli:
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillSfh.ts dev  [--dry-run] [--pace 500]
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillSfh.ts prod [--dry-run] [--pace 500]
//
//   dev  → uses DATABASE_URL       prod → uses PROD_DATABASE_URL
//
// --dry-run  count the eligible backlog and exit without calling SFH or writing.
// --pace <ms>  delay between SFH calls (default 500ms) — SFH is community-run.

// Mark this file as a module so its top-level names don't collide in the global
// scope with the other tsx scripts (all use dynamic import() rather than
// top-level imports, which would otherwise leave them as global scripts).
export {}

const args = process.argv.slice(2)
const target = args[0]
const dryRun = args.includes('--dry-run')
const paceIdx = args.indexOf('--pace')
const paceMs = paceIdx !== -1 ? Number(args[paceIdx + 1]) : 500

if (target !== 'dev' && target !== 'prod') {
  console.error(
    'Usage: backfillSfh.ts <dev|prod> [--dry-run] [--pace <ms>]\n' +
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
// the connection at import time, so prisma + sfhSync are dynamically imported
// only after this assignment.
const connectionString =
  target === 'prod' ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL

if (!connectionString) {
  const varName = target === 'prod' ? 'PROD_DATABASE_URL' : 'DATABASE_URL'
  console.error(
    `${varName} is not set. Run with the root .env loaded, e.g.\n` +
      `  pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/backfillSfh.ts ${target}`
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
  const { checkAndPersistSfhNong } = await import('../services/sfhSync')

  console.log(
    `SFH backfill → target=${target} host=${maskHost(connectionString!)} ` +
      `dryRun=${dryRun} paceMs=${paceMs}`
  )

  // The SFH gate the sync uses: never successfully checked, not delisted.
  const levels = await prisma.level.findMany({
    where: { sfhCheckedAt: null, delistedAt: null },
    select: { inGameId: true, isRated: true },
    orderBy: { inGameId: 'asc' },
  })

  console.log(`Eligible levels (sfhCheckedAt=null, not delisted): ${levels.length}`)

  if (dryRun) {
    console.log('Dry run — no SFH calls made, nothing written.')
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
    const { inGameId, isRated } = levels[i]!
    if (i > 0 && paceMs > 0) await sleep(paceMs)

    // Never throws (see sfhSync): a failed call returns 'failed' and writes
    // nothing, so we tally and move on.
    const outcome = await checkAndPersistSfhNong(inGameId, isRated)
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
        ? ` — ${failed} left sfhCheckedAt=null; re-run to retry (or the cron will).`
        : '')
  )
}

main()
  .catch((err) => {
    console.error('SFH backfill failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    const { default: prisma } = await import('../utils/prisma')
    await prisma.$disconnect()
  })
