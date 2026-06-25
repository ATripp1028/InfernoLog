import prisma from '../utils/prisma'
import { decryptSecret } from '../utils/kms'
import { syncGddlSubmissions } from '../services/gddlSync'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

interface WorkerEvent {
  jobId: string
  userId: string
}

export const handler = async (event: WorkerEvent): Promise<void> => {
  const { jobId, userId } = event
  logger.info({ jobId, userId }, 'gddlSyncWorker: starting')

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { gddlApiKeyEncrypted: true },
    })

    if (!user.gddlApiKeyEncrypted) {
      await prisma.gddlSyncJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: 'No GDDL API key configured', finishedAt: new Date() },
      })
      return
    }

    const apiKey = await decryptSecret(user.gddlApiKeyEncrypted)
    const result = await syncGddlSubmissions(userId, apiKey)

    await prisma.gddlSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        result: result as object,
        finishedAt: new Date(),
      },
    })

    logger.info({ jobId, userId, result }, 'gddlSyncWorker: completed')
  } catch (err) {
    logger.error({ jobId, userId, err }, 'gddlSyncWorker: unhandled error')
    Sentry.captureException(err)

    try {
      await prisma.gddlSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          finishedAt: new Date(),
        },
      })
    } catch (updateErr) {
      logger.error({ jobId, updateErr }, 'gddlSyncWorker: failed to update job status')
    }
  }
}
