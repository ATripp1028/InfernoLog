// One-off remediation for levels wrongly marked delisted by the RobTop sync.
//
// Background: before the fix in services/levelSync.ts, the sync delisted a level
// whenever fetchRobtopLevel returned null — but that wrapper collapsed BOTH
// "GD has no such level" (not-found) AND "the call failed" (unreachable) into
// null. So a throttled sync batch (e.g. Cloudflare 1020 mid-run) delisted live
// levels. The fix stops NEW false delistings; this script repairs the rows
// already corrupted, which the crons will NOT self-heal (both sync selects
// exclude delistedAt != null, so a delisted row is never revisited).
//
// Per delisted row, in scope:
//   - dataSource='official' → un-delisted unconditionally. Official levels exist;
//     getGJLevels21 simply never returns them, so they were ALWAYS a false
//     positive (and the fixed sync now excludes them entirely). No RobTop call.
//   - otherwise → re-resolved via fetchRobtopLevelResult (the fixed, distinction-
//     preserving path):
//       found       → clear delistedAt (was a false positive). Metadata is left
//                     at its last-known-good frozen values; the next sync
//                     refreshes it.
//       not_found   → genuinely gone. Left delisted.
//       unreachable → transient; left untouched, re-run (or a later pass) retries.
//
// Idempotent: a second run only revisits rows still delisted. Safe to re-run to
// mop up levels that were unreachable the first time.
//
// Usage (from apps/api), connection string from the root .env via dotenv-cli:
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/undelistFalsePositives.ts dev  [--dry-run] [--since 2026-08-01] [--pace 670]
//   pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/undelistFalsePositives.ts prod [--dry-run] [--since 2026-08-01] [--pace 670]
//
//   dev → DATABASE_URL   prod → PROD_DATABASE_URL
//
// --dry-run       report the delisted backlog (official vs custom) and exit;
//                 no RobTop calls, no writes.
// --since <date>  only rows with delistedAt >= this date (ISO, e.g. 2026-08-01).
//                 Omit to sweep every delisted row.
// --pace <ms>     delay between RobTop calls (default 670; official un-delists
//                 make no call and aren't paced).

// Mark this file as a module so its top-level names don't collide in the global
// scope with the other tsx scripts (all use dynamic import() rather than
// top-level imports, which would otherwise leave them as global scripts).
export {}

const args = process.argv.slice(2)
const target = args[0]
const dryRun = args.includes('--dry-run')

function flagValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

const paceRaw = flagValue('--pace')
const paceMs = paceRaw !== undefined ? Number(paceRaw) : 670
const sinceRaw = flagValue('--since')
const since = sinceRaw !== undefined ? new Date(sinceRaw) : undefined

if (target !== 'dev' && target !== 'prod') {
  console.error(
    'Usage: undelistFalsePositives.ts <dev|prod> [--dry-run] [--since <date>] [--pace <ms>]\n' +
      `  got target=${JSON.stringify(target)}`
  )
  process.exit(1)
}
if (!Number.isFinite(paceMs) || paceMs < 0) {
  console.error(`Invalid --pace value: ${JSON.stringify(paceRaw)}`)
  process.exit(1)
}
if (since !== undefined && Number.isNaN(since.getTime())) {
  console.error(`Invalid --since date: ${JSON.stringify(sinceRaw)}`)
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
      `  pnpm dlx dotenv-cli -e ../../.env -- pnpm tsx src/scripts/undelistFalsePositives.ts ${target}`
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

async function main() {
  const { default: prisma } = await import('../utils/prisma')
  const { fetchRobtopLevelResult } = await import('../utils/robtop')

  console.log(
    `Un-delist remediation → target=${target} host=${maskHost(connectionString!)} ` +
      `dryRun=${dryRun} paceMs=${paceMs}` +
      (since ? ` since=${since.toISOString()}` : ' since=<all>')
  )

  const where = {
    delistedAt: since ? { gte: since } : { not: null },
  } as const

  const rows = await prisma.level.findMany({
    where,
    select: { inGameId: true, dataSource: true, delistedAt: true },
    orderBy: { inGameId: 'asc' },
  })

  const official = rows.filter((r) => r.dataSource === 'official')
  const custom = rows.filter((r) => r.dataSource !== 'official')

  console.log(
    `Delisted rows in scope: ${rows.length} ` +
      `(official=${official.length}, custom=${custom.length})`
  )

  if (dryRun) {
    console.log(
      'Dry run — no RobTop calls, nothing written. On a real run: all official ' +
        'rows are un-delisted; each custom row is re-resolved and un-delisted ' +
        'only if RobTop still returns it.'
    )
    return
  }
  if (rows.length === 0) {
    console.log('Nothing to remediate.')
    return
  }

  // Official levels: un-delist unconditionally, no RobTop call.
  let undelistedOfficial = 0
  for (const row of official) {
    await prisma.level.update({
      where: { inGameId: row.inGameId },
      data: { delistedAt: null },
    })
    undelistedOfficial++
  }
  if (official.length > 0) {
    console.log(`Un-delisted ${undelistedOfficial} official level(s).`)
  }

  // Custom levels: re-resolve and only un-delist a genuine false positive.
  let undelisted = 0
  let stillGone = 0
  let unreachable = 0

  for (let i = 0; i < custom.length; i++) {
    const { inGameId } = custom[i]!
    if (i > 0 && paceMs > 0) await sleep(paceMs)

    const res = await fetchRobtopLevelResult(inGameId)

    if (res.status === 'found') {
      // False positive — the level is alive. Clear the flag; leave the frozen
      // last-known metadata for the next sync to refresh.
      await prisma.level.update({
        where: { inGameId },
        data: { delistedAt: null },
      })
      undelisted++
    } else if (res.status === 'not_found') {
      // Genuinely gone — correctly delisted. Leave it.
      stillGone++
    } else {
      // Transient failure — leave untouched; re-run retries.
      unreachable++
    }

    const processed = i + 1
    if (processed % 50 === 0 || processed === custom.length) {
      console.log(
        `[custom ${processed}/${custom.length}] undelisted=${undelisted} ` +
          `stillGone=${stillGone} unreachable=${unreachable}`
      )
    }
  }

  console.log(
    `Done. official_undelisted=${undelistedOfficial} ` +
      `custom_undelisted=${undelisted} custom_stillGone=${stillGone} ` +
      `custom_unreachable=${unreachable}` +
      (unreachable > 0
        ? ` — ${unreachable} left delisted (RobTop unreachable); re-run to retry.`
        : '')
  )
}

main()
  .catch((err) => {
    console.error('Un-delist remediation failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    const { default: prisma } = await import('../utils/prisma')
    await prisma.$disconnect()
  })
