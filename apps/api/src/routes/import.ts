// POST /v1/me/import/check   — read-only conflict check
// POST /v1/me/import/start   — persists the full dataset, kicks off the
//                              background worker, returns 202 + jobId
// GET  /v1/me/import/status  — poll the current job (survives closed tabs)
// PATCH /v1/me/import/rows/{rowId}/resolve — mark one flagged row resolved
// POST /v1/me/import/resolve-all           — mark all flagged rows resolved
//
// All are own-account only: the authenticated user comes from the JWT
// (c.get('userId')), never from the path or payload.

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type { Prisma } from '@prisma/client'
import {
  ImportCheckRequestSchema,
  ImportStartRequestSchema,
  EXPORT_SECTIONS,
  type ExportSection,
  type ImportStatusResponse,
} from '@infernolog/core'
import { logger } from '../utils/logger'
import prisma from '../utils/prisma'
import type { HonoVariables } from '../types/hono'
import { checkImportConflicts } from '../services/import'
import {
  exportSection,
  EXPORT_DEFAULT_LIMIT,
  EXPORT_MAX_LIMIT,
} from '../services/exportData'

const app = new Hono<{ Variables: HonoVariables }>()

const lambda = new LambdaClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

// POST /v1/me/import/check — returns which of the given level IDs the
// authenticated user already has a completion for, with summary detail
// for the conflict UI. Read-only; no writes.
app.post('/me/import/check', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ImportCheckRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await checkImportConflicts(userId, parsed.data.levelIds)
    return c.json(result, 200)
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import/check error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/import/start — persists the whole validated dataset (rows +
// optional ranking/collections/ratings tabs) and asynchronously invokes the
// worker Lambda with just { jobId } (async Lambda invoke has a 256KB payload
// cap, far too small for a full spreadsheet — the dataset lives in Postgres,
// not the invoke payload). Starting a new import discards any previous job
// for this user entirely (cascades its rows) — there is no import history.
app.post('/me/import/start', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ImportStartRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const { rows, ranking, collections, ratings } = parsed.data

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
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import/start error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/me/import/status — the user's current import job (or null), with
// live progress and the flagged rows the review UI surfaces. Polled by the
// frontend (toast, Settings subline, Done screen) — safe to call frequently.
app.get('/me/import/status', async (c) => {
  const userId = c.get('userId') as string

  try {
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
      collectionsResult:
        (job.collectionsResult as ImportStatusResponse['collectionsResult']) ??
        null,
      ratingsResult:
        (job.ratingsResult as ImportStatusResponse['ratingsResult']) ?? null,
    }

    return c.json({ data }, 200)
  } catch (err) {
    logger.error({ userId, err }, 'GET /me/import/status error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PATCH /v1/me/import/rows/{rowId}/resolve — mark one flagged row reviewed.
app.patch('/me/import/rows/:rowId/resolve', async (c) => {
  const userId = c.get('userId') as string
  const rowId = c.req.param('rowId')

  try {
    const result = await prisma.importJobRow.updateMany({
      where: { id: rowId, job: { userId } },
      data: { resolved: true },
    })
    if (result.count === 0) {
      return c.json({ error: 'Row not found' }, 404)
    }
    return c.json({ data: { resolved: true } }, 200)
  } catch (err) {
    logger.error(
      { userId, rowId, err },
      'PATCH /me/import/rows/:rowId/resolve error'
    )
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/import/resolve-all — bulk-resolve every flagged row on the
// user's current job.
app.post('/me/import/resolve-all', async (c) => {
  const userId = c.get('userId') as string

  try {
    const job = await prisma.importJob.findUnique({ where: { userId } })
    if (!job) return c.json({ error: 'No import job found' }, 404)

    await prisma.importJobRow.updateMany({
      where: { jobId: job.id, issueMessage: { not: null } },
      data: { resolved: true },
    })
    return c.json({ data: { resolved: true } }, 200)
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import/resolve-all error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/me/export?section=&offset=&limit= — one paginated section of the
// account's data in a faithful domain form. The client fetches every section to
// completion and stitches the import-compatible spreadsheet. Read-only.
app.get('/me/export', async (c) => {
  const userId = c.get('userId') as string

  try {
    const section = c.req.query('section')
    if (!section || !(EXPORT_SECTIONS as readonly string[]).includes(section)) {
      return c.json(
        { error: `section must be one of: ${EXPORT_SECTIONS.join(', ')}` },
        400
      )
    }

    const rawOffset = Number(c.req.query('offset') ?? '0')
    const rawLimit = Number(
      c.req.query('limit') ?? String(EXPORT_DEFAULT_LIMIT)
    )
    const offset = Number.isFinite(rawOffset)
      ? Math.max(0, Math.trunc(rawOffset))
      : 0
    const limit = Number.isFinite(rawLimit)
      ? Math.min(EXPORT_MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
      : EXPORT_DEFAULT_LIMIT

    const page = await exportSection(
      userId,
      section as ExportSection,
      offset,
      limit
    )
    return c.json(page, 200)
  } catch (err) {
    logger.error({ userId, err }, 'GET /me/export error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
