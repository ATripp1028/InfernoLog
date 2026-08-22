// Diagnostic probe for "is RobTop blocking US, or is RobTop down?".
//
// Run this from a NON-AWS machine (your laptop) while the RobtopCanary alarm is
// firing. That comparison is the whole point, and it is the only thing that
// answers the question: the canary tells you production cannot reach GD's
// servers, and this tells you whether anyone else can, right then.
//
//   both fail          → RobTop's servers are genuinely down or blocking
//                        everyone. Wait it out.
//   here OK, prod 403  → the request itself is fine and the difference is where
//                        it comes from — i.e. Cloudflare is blocking our egress
//                        IP/ASN, not our User-Agent. That is the case for an
//                        Elastic IP or a proxy hop for RobTop calls.
//
// It sends the same request the API sends, built by the same code
// (utils/robtopRequest.ts), so it cannot drift from what production does. It
// makes no database query, needs no AWS credentials, and does not go through
// the shared rate limiter — deliberately, so it runs anywhere and costs exactly
// one request.
//
// Usage (from apps/api):
//   pnpm probe:robtop            # level 128, the canary's level
//   pnpm probe:robtop 10565740   # any level id
//
// Exit code 0 when GD answered with the level, 1 otherwise — so it can gate a
// shell loop while waiting for a block to clear.

// Mark this file as a module so its top-level names don't collide in the global
// scope with the other tsx scripts.
export {}

const levelId = process.argv[2] ?? '128'

if (!/^\d+$/.test(levelId)) {
  console.error(
    `Usage: probeRobtop.ts [levelId]\n  got ${JSON.stringify(levelId)}`
  )
  process.exit(1)
}

async function main(): Promise<void> {
  const { buildGetGJLevels21Request, summarizeErrorBody } =
    await import('../utils/robtopRequest')
  const { parseGetGJLevels21 } = await import('../utils/robtop')

  const { url, init } = buildGetGJLevels21Request({ type: '0', str: levelId })

  console.log(`POST ${url}  (level ${levelId}, empty User-Agent)`)

  const startedAt = Date.now()
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    // A network error or timeout here is itself a result: nothing answered.
    console.error(
      `NETWORK FAILURE after ${Date.now() - startedAt}ms: ${String(err)}`
    )
    process.exitCode = 1
    return
  }

  const elapsedMs = Date.now() - startedAt
  const body = await res.text()

  console.log(`HTTP ${res.status} in ${elapsedMs}ms`)
  for (const header of ['server', 'cf-ray', 'cf-mitigated', 'retry-after']) {
    const value = res.headers.get(header)
    if (value !== null) console.log(`  ${header}: ${value}`)
  }

  if (!res.ok) {
    const summary = summarizeErrorBody(body)
    console.log(`  body: ${summary.marker ?? summary.snippet ?? '(empty)'}`)
    console.error(
      summary.blockPage
        ? '\nBLOCKED — Cloudflare refused this machine too. If production is also ' +
            'blocked right now, the block is not specific to our egress IP.'
        : '\nFAILED — a non-OK response that is not a Cloudflare block page; ' +
            "likely RobTop's origin rather than its edge."
    )
    process.exitCode = 1
    return
  }

  const level = parseGetGJLevels21(body, levelId)
  if (!level) {
    console.error(
      `\nNOT FOUND — GD answered normally but has no level ${levelId}. ` +
        'Reachability is fine; the level id is the problem.'
    )
    process.exitCode = 1
    return
  }

  console.log(`\nOK — "${level.name}" by ${level.creator ?? 'unknown'}`)
  console.error(
    'RobTop is reachable from this machine. If the canary is alarming at the ' +
      'same time, the difference is the egress, not the request.'
  )
}

main().catch((err) => {
  console.error('Probe failed:', err)
  process.exitCode = 1
})
