// Pulling data across from GDDL:
//
//   POST /v1/me/gddl-sync        — start an async record-import job
//   GET  /v1/me/gddl-sync        — poll the current/most-recent job
//   POST /v1/me/gddl-sync/ack    — mark a finished run as seen
//   POST /v1/me/gddl-lists-sync  — synchronous FAVORITES/LEAST_FAVORITES sync
//
// The job-based sync and the lists sync are unrelated mechanisms that happen to
// share the stored key: the former hands off to a worker Lambda, the latter
// runs inline because the lists are small.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import { decryptSecret } from '../../utils/kms'
import { GddlError } from '../../utils/gddl'
import { syncGddlLists } from '../../services/gddl/listSync'
import type { HonoVariables } from '../../types/hono'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

const NO_KEY_ERROR =
  'No GDDL API key configured. Connect your GDDL account first.'

// GddlSyncWorker runs with a 15-minute Lambda timeout (sst.config.ts). If a
// pending job is older than that, the worker died without ever updating the
// row (crash, undeployed ARN, etc.) — treat it as failed rather than letting
// it block sync forever, since only one job may be active per user at a time.
const GDDL_SYNC_STALE_MS = 20 * 60 * 1000

async function expireIfStale<
  T extends {
    id: string
    status: string
    startedAt: Date
    finishedAt: Date | null
    error: string | null
  },
>(job: T): Promise<T> {
  if (
    job.status !== 'pending' ||
    Date.now() - job.startedAt.getTime() <= GDDL_SYNC_STALE_MS
  ) {
    return job
  }
  const finishedAt = new Date()
  const error = 'Sync timed out'
  await prisma.gddlSyncJob.update({
    where: { id: job.id },
    data: { status: 'failed', error, finishedAt },
  })
  // Mirror the DB write in the returned object — callers (POST's "is a sync
  // already running" check and GET's response payload) read status,
  // finishedAt, and error off this return value without re-querying, so it
  // must reflect what was just persisted, not the pre-expiry job.
  return { ...job, status: 'failed', error, finishedAt }
}

// POST /v1/me/gddl-sync — creates an async sync job and returns 202 + jobId
// immediately. The actual import is handled by the GddlSyncWorker Lambda
// (invoked asynchronously) so API Gateway's 29-second integration timeout
// never applies regardless of how many GDDL pages / RobTop lookups are needed.
// Only one job may be active per user at a time: if one is already pending,
// this returns its id instead of starting a second (idempotent under
// double-clicks/multiple tabs, and keeps GET /me/gddl-sync's "most recent
// job" always the one job a client could actually be waiting on).
app.post('/me/gddl-sync', async (c) => {
  const userId = c.get('userId')

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { gddlApiKeyEncrypted: true },
  })

  if (!user.gddlApiKeyEncrypted) {
    return c.json({ error: NO_KEY_ERROR }, 400)
  }

  const existingJob = await prisma.gddlSyncJob.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      error: true,
    },
  })
  const existing = existingJob ? await expireIfStale(existingJob) : null

  if (existing?.status === 'pending') {
    return c.json({ data: { jobId: existing.id } }, 202)
  }

  // One row per user (userId is unique) — a prior completed/failed job is
  // overwritten rather than left to accumulate; nothing reads sync history
  // beyond the latest job. acknowledgedAt resets to null here so this run's
  // eventual completion is visible via GET even though `id` doesn't change
  // between runs (see the model's schema comment).
  const job = await prisma.gddlSyncJob.upsert({
    where: { userId },
    create: { userId, status: 'pending' },
    update: {
      status: 'pending',
      result: Prisma.JsonNull,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
      acknowledgedAt: null,
    },
    select: { id: true },
  })

  const lambda = new LambdaClient({})
  await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.GDDL_SYNC_WORKER_ARN!, // always set by SST
      InvocationType: 'Event', // async — do not wait for the worker to finish
      Payload: JSON.stringify({ jobId: job.id, userId }),
    })
  )

  return c.json({ data: { jobId: job.id } }, 202)
})

// GET /v1/me/gddl-sync — the user's GDDL sync job (or null), mirroring GET
// /v1/me/import/status for spreadsheet import: no job id needed, so the
// frontend can poll this from anywhere without having to carry a job id
// across navigation or a page reload. GddlSyncJob is one-per-user (like
// ImportJob) — a new sync overwrites the previous job (see POST handler
// above) — so this always returns the single current/most-recent job while
// it's still relevant: pending, or completed/failed but not yet acknowledged.
// No time-based cutoff on the unacknowledged case — the client calls POST
// /me/gddl-sync/ack right after showing the result, scoped to this specific
// run via `startedAt` (see that handler), so a completion simply stays
// visible until it's actually been seen, however long the client was away.
// `startedAt` is included in the response so the client can pass it back to
// /ack. A stale pending job is lazily expired here so the UI it drives (e.g.
// the disabled Sync button) can recover without the user needing to trigger
// a new sync attempt first.
app.get('/me/gddl-sync', async (c) => {
  const userId = c.get('userId')

  const job = await prisma.gddlSyncJob.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      result: true,
      error: true,
      startedAt: true,
      finishedAt: true,
      acknowledgedAt: true,
    },
  })
  const current = job ? await expireIfStale(job) : null
  const visible =
    current !== null &&
    (current.status === 'pending' || !current.acknowledgedAt)

  return c.json(
    {
      data: visible
        ? {
            id: current.id,
            status: current.status,
            result: current.result,
            error: current.error,
            startedAt: current.startedAt.toISOString(),
          }
        : null,
    },
    200
  )
})

// POST /v1/me/gddl-sync/ack — marks a completed/failed job as acknowledged
// so GET stops returning it. Called by the client right after it shows the
// result (toast/invalidation) for that job/run. `id` alone can't identify
// "this run" — it's stable forever per user, so a new sync reuses the same
// row — so the where-clause also pins `startedAt` (echoed back from what
// GET returned for the run being acknowledged). Without that, a delayed ack
// for an old run could match a newer run that's since completed on the same
// row (same id, no longer 'pending') and silently mark it acknowledged
// before the client ever saw it; pinning startedAt makes that a guaranteed
// no-op instead, since a new run always gets a fresh startedAt. Scoped to
// { id, userId, startedAt } and a no-op if nothing matches (wrong id/run,
// already acknowledged, or superseded by a new sync) — the client only
// cares that its run is no longer visible afterward, not who won a race.
const AckGddlSyncSchema = z.object({
  jobId: z.string().min(1),
  startedAt: z.string().datetime(),
})

app.post('/me/gddl-sync/ack', async (c) => {
  const userId = c.get('userId')

  const parsed = await parseJsonBody(c, AckGddlSyncSchema)
  if (!parsed.ok) return parsed.response

  await prisma.gddlSyncJob.updateMany({
    where: {
      id: parsed.data.jobId,
      userId,
      status: { not: 'pending' },
      startedAt: new Date(parsed.data.startedAt),
    },
    data: { acknowledgedAt: new Date() },
  })

  return c.json({ data: { acknowledged: true } }, 200)
})

// POST /v1/me/gddl-lists-sync — bidirectional sync of FAVORITES and
// LEAST_FAVORITES collections with the corresponding GDDL user lists.
// Synchronous (lists are small); requires KMS decrypt to read the stored key.
app.post('/me/gddl-lists-sync', async (c) => {
  const userId = c.get('userId')

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { gddlApiKeyEncrypted: true },
    })

    if (!user.gddlApiKeyEncrypted) {
      return c.json({ error: NO_KEY_ERROR }, 400)
    }

    const apiKey = await decryptSecret(user.gddlApiKeyEncrypted)
    const result = await syncGddlLists(userId, apiKey)

    logger.info({ userId, result }, 'gddl-lists-sync: complete')
    return c.json({ data: result })
  } catch (err) {
    // GDDL itself refused or was unreachable — an upstream fault, not ours.
    if (err instanceof GddlError) {
      return c.json({ error: err.message }, 502)
    }
    throw err
  }
})

export default app
