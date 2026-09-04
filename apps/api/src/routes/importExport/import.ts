// Spreadsheet import — a job-based flow:
//
//   POST  /v1/me/import/check                  — read-only conflict check
//   POST  /v1/me/import/start                  — persist the dataset, kick off the worker
//   GET   /v1/me/import/status                 — poll the current job
//   PATCH /v1/me/import/rows/:rowId/resolve    — mark one flagged row reviewed
//   POST  /v1/me/import/resolve-all            — mark all flagged rows reviewed
//
// One job per user: starting a new import discards the previous one entirely
// (cascading its rows). There is no import history.

import { Hono } from 'hono'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type { Prisma } from '@prisma/client'
import {
  ImportCheckRequestSchema,
  ImportStartRequestSchema,
  type ImportStatusResponse,
} from '@infernolog/core'
import { logger } from '../../utils/logger'
import prisma from '../../utils/prisma'
import type { HonoVariables } from '../../types/hono'
import { checkImportConflicts } from '../../services/importExport/import'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

const lambda = new LambdaClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

// POST /v1/me/import/check — returns which of the given level IDs the
// authenticated user already has a completion for, with summary detail
// for the conflict UI. Read-only; no writes.
app.post('/me/import/check', async (c) => {
  const userId = c.get('userId')

  // Every field of the schema is optional, so an unparseable body must be
  // rejected rather than falling back to `{}` — that would answer "no
  // conflicts" without having examined anything.
  const parsed = await parseJsonBody(c, ImportCheckRequestSchema)
  if (!parsed.ok) return parsed.response

  const result = await checkImportConflicts(userId, parsed.data)
  return c.json(result, 200)
})

// POST /v1/me/import/start — persists the whole validated dataset (rows +
// optional ranking/collections/ratings tabs) and asynchronously invokes the
// worker Lambda with just { jobId } (async Lambda invoke has a 256KB payload
// cap, far too small for a full spreadsheet — the dataset lives in Postgres,
// not the invoke payload). Starting a new import discards any previous job
// for this user entirely (cascades its rows) — there is no import history.
app.post('/me/import/start', async (c) => {
  const userId = c.get('userId')

  const parsed = await parseJsonBody(c, ImportStartRequestSchema)
  if (!parsed.ok) return parsed.response

  const { rows, ranking, ratingRanking, collections, ratings } = parsed.data

  const job = await prisma.$transaction(async (tx) => {
    await tx.importJob.deleteMany({ where: { userId } })
    const created = await tx.importJob.create({
      data: {
        userId,
        status: 'running',
        totalRows: rows.length,
        ...(ranking
          ? { rankingPayload: ranking as unknown as Prisma.InputJsonValue }
          : {}),
        ...(ratingRanking
          ? {
              ratingRankingPayload:
                ratingRanking as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(collections
          ? {
              collectionsPayload:
                collections as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(ratings
          ? { ratingsPayload: ratings as unknown as Prisma.InputJsonValue }
          : {}),
      },
    })
    await tx.importJobRow.createMany({
      data: rows.map((r) => ({
        jobId: created.id,
        rowIndex: r.rowIndex,
        rawData: r as unknown as Prisma.InputJsonValue,
        status: 'pending',
        levelName: r.data.levelName ?? null,
        identifier: r.data.levelId ?? null,
      })),
    })
    return created
  })

  const workerArn = process.env.IMPORT_WORKER_ARN
  if (workerArn) {
    await lambda.send(
      new InvokeCommand({
        FunctionName: workerArn,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ jobId: job.id })),
      })
    )
  } else {
    logger.error('IMPORT_WORKER_ARN not configured — job will never process')
  }

  logger.info(
    { userId, jobId: job.id, rowCount: rows.length },
    'POST /me/import/start: job created'
  )

  return c.json({ jobId: job.id }, 202)
})

// GET /v1/me/import/status — the user's current import job (or null), with
// live progress and the flagged rows the review UI surfaces. Polled by the
// frontend (toast, Settings subline, Done screen) — safe to call frequently.
app.get('/me/import/status', async (c) => {
  const userId = c.get('userId')

  const job = await prisma.importJob.findUnique({
    where: { userId },
    include: {
      rows: {
        where: { issueMessage: { not: null } },
        orderBy: { rowIndex: 'asc' },
      },
    },
  })

  if (!job) return c.json({ data: null }, 200)

  const counts = await prisma.importJobRow.groupBy({
    by: ['status'],
    where: { jobId: job.id },
    _count: { status: true },
  })
  const outcomeCounts = { committed: 0, updated: 0, skipped: 0, failed: 0 }
  for (const row of counts) {
    if (row.status in outcomeCounts) {
      outcomeCounts[row.status as keyof typeof outcomeCounts] =
        row._count.status
    }
  }

  const data: ImportStatusResponse = {
    status: job.status as ImportStatusResponse['status'],
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    error: job.error,
    outcomeCounts,
    flaggedRows: job.rows.map((r) => ({
      id: r.id,
      rowIndex: r.rowIndex,
      levelName: r.levelName,
      identifier: r.identifier,
      issueMessage: r.issueMessage!,
      resolved: r.resolved,
    })),
    rankingResult:
      (job.rankingResult as ImportStatusResponse['rankingResult']) ?? null,
    ratingRankingResult:
      (job.ratingRankingResult as ImportStatusResponse['ratingRankingResult']) ??
      null,
    collectionsResult:
      (job.collectionsResult as ImportStatusResponse['collectionsResult']) ??
      null,
    ratingsResult:
      (job.ratingsResult as ImportStatusResponse['ratingsResult']) ?? null,
  }

  return c.json({ data }, 200)
})

// PATCH /v1/me/import/rows/{rowId}/resolve — mark one flagged row reviewed.
app.patch('/me/import/rows/:rowId/resolve', async (c) => {
  const userId = c.get('userId')
  const rowId = c.req.param('rowId')

  const result = await prisma.importJobRow.updateMany({
    where: { id: rowId, job: { userId } },
    data: { resolved: true },
  })
  if (result.count === 0) {
    return c.json({ error: 'Row not found' }, 404)
  }
  return c.json({ data: { resolved: true } }, 200)
})

// POST /v1/me/import/resolve-all — bulk-resolve every flagged row on the
// user's current job.
app.post('/me/import/resolve-all', async (c) => {
  const userId = c.get('userId')

  const job = await prisma.importJob.findUnique({ where: { userId } })
  if (!job) return c.json({ error: 'No import job found' }, 404)

  await prisma.importJobRow.updateMany({
    where: { jobId: job.id, issueMessage: { not: null } },
    data: { resolved: true },
  })
  return c.json({ data: { resolved: true } }, 200)
})

export default app
