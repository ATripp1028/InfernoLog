// SQS consumer — async metadata enrichment for stub levels created during
// spreadsheet import. On success the stub row is upgraded to
// data_source='robtop_autofill', verified=true. On failure (RobTop
// unavailable or level not found) the stub stands — this is NOT an error;
// the DLQ is just a safety net for infra failures.
//
// Pacing against RobTop is handled by the shared rate limiter every caller
// of fetchRobtopLevel goes through (see utils/robtopRateLimit.ts) — this
// worker doesn't need (and no longer does) its own local sleep-based pacing
// between levels; that would just be a second, redundant ceiling on top of
// the real one.

import prisma from '../utils/prisma'
import {
  fetchRobtopLevelResult,
  type RobtopFetchResult,
} from '../utils/robtop'
import { buildRobtopRefreshData } from '../services/levels/robtopMapping'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

interface SeedMessage {
  levelIds: string[]
}

interface SQSRecord {
  body: string
}

interface SQSEvent {
  Records: SQSRecord[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// In-invocation retries for a level RobTop couldn't be REACHED for. Uses the
// result-preserving fetch so a genuine not-found is terminal on the first
// answer rather than being asked three times.
//
// These attempts span ~4 seconds, which is deliberately no match for a 429
// cooldown (60s–5min, and acquireRobtopSlot fails instantly for its whole
// duration). They cover the brief blip; anything longer is handed to SQS
// redrive by the handler below, which is the retry mechanism sized for it.
//
// The backoff between attempts here is a distinct concern from the shared
// rate limiter: it's not about this worker's own request rate (the limiter
// already owns that), it's about not immediately re-hitting the exact same
// level that just failed, in case that specific failure needs a moment to
// clear.
const FETCH_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [1000, 3000]

async function fetchRobtopLevelWithRetries(
  levelId: string
): Promise<RobtopFetchResult> {
  // FETCH_ATTEMPTS is >= 1, so the loop always overwrites this; it exists only
  // to satisfy the compiler. 'limiter' is the honest reason for the state it
  // describes — we have not called RobTop yet.
  let last: RobtopFetchResult = { status: 'unreachable', reason: 'limiter' }
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 1000)
    last = await fetchRobtopLevelResult(levelId)
    if (last.status !== 'unreachable') return last
  }
  return last
}

/**
 * SQS consumer that enriches stub levels created during spreadsheet import.
 *
 * On success the stub is upgraded to a full, verified RobTop snapshot. On
 * failure — RobTop unavailable, or the level genuinely not found — the stub
 * stands; that is NOT an error, and the DLQ exists only as a safety net for
 * infra failures. Per-level errors are logged and reported but never abort the
 * rest of the batch.
 *
 * @param event - SQS batch whose message bodies are `{ levelIds: string[] }`.
 */
export const handler = async (event: SQSEvent): Promise<void> => {
  // Levels this invocation could not REACH RobTop for. Collected rather than
  // thrown on the spot so the rest of the batch still gets its chance, then
  // rethrown at the end to fail the invocation and let SQS redeliver — see the
  // throw below.
  const unreachable: string[] = []

  for (const record of event.Records) {
    let message: SeedMessage
    try {
      message = JSON.parse(record.body) as SeedMessage
    } catch {
      logger.warn({ body: record.body }, 'levelSeedWorker: unparseable message')
      continue
    }

    const { levelIds } = message
    if (!Array.isArray(levelIds) || !levelIds.length) continue

    for (const levelId of levelIds) {
      if (!levelId) continue

      try {
        // Skip if already verified (another consumer beat us to it).
        const existing = await prisma.level.findUnique({
          where: { inGameId: levelId },
          select: { verified: true },
        })
        if (existing?.verified) continue

        const res = await fetchRobtopLevelWithRetries(levelId)

        if (res.status === 'not_found') {
          // GD has no such level. Terminal — the stub stands, and re-queueing
          // would just ask the same unanswerable question forever.
          logger.info(
            { levelId },
            'levelSeedWorker: RobTop has no such level; stub retained'
          )
          continue
        }

        if (res.status === 'unreachable') {
          // Says NOTHING about whether the level exists, so retaining the stub
          // here would turn a transient throttle into permanent missing data —
          // which is exactly what happened to the 2026-07-21 GDDL import.
          // Defer to SQS instead of deciding now.
          unreachable.push(levelId)
          continue
        }

        await prisma.level.update({
          where: { inGameId: levelId },
          data: buildRobtopRefreshData(res.level),
        })

        logger.info({ levelId }, 'levelSeedWorker: enriched stub level')
      } catch (err) {
        // Log and capture; let the message eventually reach the DLQ rather
        // than blocking the rest of the batch.
        logger.error({ levelId, err }, 'levelSeedWorker: error enriching level')
        Sentry.captureException(err)
      }
    }
  }

  // Fail the invocation so SQS makes the message visible again and redelivers
  // it (the queue is configured with retry: 3 → DLQ). The gap between attempts
  // is the queue's visibility timeout — set to 15 minutes in infra/queue.ts
  // precisely so this path works, rather than the ~4s of in-invocation retries
  // — which is the right order of magnitude for a RobTop cooldown to clear.
  // Shortening that timeout re-breaks this: all three retries would land inside
  // a single cooldown and the message would DLQ with its stubs unenriched.
  //
  // Safe to redeliver the whole message: levels already enriched by this run
  // are skipped by the `verified` check at the top of the loop, so a retry only
  // re-attempts what's still outstanding.
  if (unreachable.length) {
    throw new Error(
      `levelSeedWorker: RobTop unreachable for ${unreachable.length} level(s) ` +
        `(${unreachable.join(', ')}); failing the batch for SQS retry`
    )
  }
}
