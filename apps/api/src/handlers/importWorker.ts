// Background worker for POST /v1/me/import/start. Invoked asynchronously with
// just { jobId } (the full dataset was already persisted by the route
// handler — async Lambda invoke payloads cap at 256KB, far too small for a
// spreadsheet). Processes pending rows in batches of 50, checkpointing
// processedRows in Postgres after each one so progress survives a closed tab
// or a reload. If the Lambda is about to run out of time, it asynchronously
// invokes itself again with the same jobId and returns — resumability falls
// out naturally from row state living in the DB, not in Lambda memory.

import prisma from '../utils/prisma'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { processImportJobBatch } from '../services/importExport/import'
import { commitImportRanking } from '../services/importExport/demonList'
import { commitImportCollections } from '../services/importExport/collections'
import { commitImportRatings } from '../services/importExport/ratings'
import type { Prisma } from '@prisma/client'
import type {
  ImportCommitRow,
  ImportRankingEntry,
  ImportCollectionEntry,
  ImportRatingEntry,
} from '@infernolog/core'

interface WorkerEvent {
  jobId: string
}

interface LambdaContext {
  invokedFunctionArn: string
  getRemainingTimeInMillis(): number
}

const BATCH_SIZE = 50
// Stop pulling new batches and checkpoint via self-reinvoke once less than
// this much time is left — comfortably covers one more batch's worst case.
const REMAINING_TIME_SAFETY_MS = 60_000
// Hard cap on self-reinvocations so a permanently-broken row (e.g. an
// external API that's down) can't reinvoke forever.
const MAX_REINVOKES = 20

const lambda = new LambdaClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

async function bumpReinvokeCount(jobId: string): Promise<number> {
  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: { reinvokeCount: { increment: 1 } },
    select: { reinvokeCount: true },
  })
  return updated.reinvokeCount
}

/**
 * Processes a spreadsheet import job to completion, resuming itself as needed.
 *
 * Invoked asynchronously with just `{ jobId }` — the dataset was already
 * persisted by POST /v1/me/import/start, since async Lambda invoke payloads cap
 * at 256KB. Rows are processed in batches of 50 with `processedRows`
 * checkpointed to Postgres after each batch, so progress survives a closed tab
 * or a reload. When the Lambda is about to time out it re-invokes itself with
 * the same jobId and returns; resumability falls out of row state living in the
 * DB rather than in Lambda memory. The ranking/collections/ratings tabs are
 * committed once all rows are done.
 *
 * @param event - `{ jobId }` identifying the ImportJob.
 */
export const handler = async (
  event: WorkerEvent,
  context: LambdaContext
): Promise<void> => {
  const { jobId } = event

  try {
    const job = await prisma.importJob.findUnique({ where: { id: jobId } })
    if (!job) {
      // Superseded by a newer import — userId is unique on ImportJob, so
      // starting a new one deletes this job (cascading its rows).
      logger.info({ jobId }, 'importWorker: job not found, skipping')
      return
    }
    if (job.status !== 'running') {
      logger.info(
        { jobId, status: job.status },
        'importWorker: job already finished'
      )
      return
    }

    for (;;) {
      const pendingRows = await prisma.importJobRow.findMany({
        where: { jobId, status: 'pending' },
        orderBy: { rowIndex: 'asc' },
        take: BATCH_SIZE,
      })
      if (pendingRows.length === 0) break

      await processImportJobBatch(
        job.userId,
        jobId,
        pendingRows.map((r) => ({
          id: r.id,
          rowIndex: r.rowIndex,
          rawData: r.rawData as unknown as ImportCommitRow,
        }))
      )

      if (context.getRemainingTimeInMillis() < REMAINING_TIME_SAFETY_MS) {
        const reinvokeCount = await bumpReinvokeCount(jobId)
        if (reinvokeCount > MAX_REINVOKES) {
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              status: 'failed',
              error:
                'Import timed out after repeated retries — a row may be permanently stuck.',
              finishedAt: new Date(),
            },
          })
          logger.error(
            { jobId, reinvokeCount },
            'importWorker: exceeded reinvoke cap, failing job'
          )
          return
        }
        await lambda.send(
          new InvokeCommand({
            FunctionName: context.invokedFunctionArn,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify({ jobId })),
          })
        )
        logger.info(
          { jobId, reinvokeCount },
          'importWorker: checkpointing, self-reinvoking'
        )
        return
      }
    }

    // All rows processed — run the one-shot ranking/collections/ratings
    // passes (each only if the sheet had that tab).
    const rankingResult = job.rankingPayload
      ? await commitImportRanking(
          job.userId,
          job.rankingPayload as unknown as ImportRankingEntry[]
        )
      : null
    const collectionsResult = job.collectionsPayload
      ? await commitImportCollections(
          job.userId,
          job.collectionsPayload as unknown as ImportCollectionEntry[]
        )
      : null
    const ratingsResult = job.ratingsPayload
      ? await commitImportRatings(
          job.userId,
          job.ratingsPayload as unknown as ImportRatingEntry[]
        )
      : null

    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        ...(rankingResult
          ? { rankingResult: rankingResult as unknown as Prisma.InputJsonValue }
          : {}),
        ...(collectionsResult
          ? {
              collectionsResult:
                collectionsResult as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(ratingsResult
          ? { ratingsResult: ratingsResult as unknown as Prisma.InputJsonValue }
          : {}),
      },
    })

    logger.info({ jobId, userId: job.userId }, 'importWorker: completed')
  } catch (err) {
    logger.error({ jobId, err }, 'importWorker: unhandled error')
    Sentry.captureException(err)
    try {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: 'Import failed due to an internal error.',
          finishedAt: new Date(),
        },
      })
    } catch (updateErr) {
      logger.error(
        { jobId, updateErr },
        'importWorker: failed to update job status'
      )
      Sentry.captureException(updateErr)
    }
  }
}
