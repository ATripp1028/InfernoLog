import prisma from '../utils/prisma'
import { decryptSecret } from '../utils/kms'
import { syncGddlSubmissions } from '../services/gddl/sync'
import { logger } from '../utils/logger'
import { GddlError, GddlInvalidKeyError } from '../utils/gddl'
import * as Sentry from '@sentry/aws-serverless'

interface WorkerEvent {
  jobId: string
  userId: string
}

function userMessage(err: unknown): string {
  if (err instanceof GddlInvalidKeyError) {
    return 'Your GDDL API key was rejected. Try reconnecting your GDDL account.'
  }
  if (err instanceof GddlError) {
    return 'Could not reach GDDL. Please try again later.'
  }
  return 'Sync failed due to an internal error.'
}

/**
 * Runs one user's GDDL submission sync in the background.
 *
 * Invoked asynchronously by POST /v1/me/gddl-sync. Decrypts the user's stored
 * GDDL key, pulls their submissions, and writes the result onto the
 * GddlSyncJob row so the polling endpoint can report it. Failures are recorded
 * on the job with a user-facing message rather than thrown, so the UI can
 * explain what happened instead of spinning.
 *
 * @param event - `{ jobId, userId }` from the invoking route.
 */
export const handler = async (event: WorkerEvent): Promise<void> => {
  const { jobId, userId } = event

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { gddlApiKeyEncrypted: true },
    })

    if (!user.gddlApiKeyEncrypted) {
      await prisma.gddlSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: 'No GDDL API key configured.',
          finishedAt: new Date(),
        },
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

    logger.info({ jobId, userId, ...result }, 'gddlSyncWorker: completed')
  } catch (err) {
    const isGddlSideError = err instanceof GddlError

    if (isGddlSideError) {
      logger.warn({ jobId, userId }, `gddlSyncWorker: ${userMessage(err)}`)
    } else {
      logger.error({ jobId, userId, err }, 'gddlSyncWorker: unhandled error')
      Sentry.captureException(err)
    }

    try {
      await prisma.gddlSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: userMessage(err),
          finishedAt: new Date(),
        },
      })
    } catch (updateErr) {
      logger.error(
        { jobId, updateErr },
        'gddlSyncWorker: failed to update job status'
      )
      Sentry.captureException(updateErr)
    }
  }
}
