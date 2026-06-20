// Orchestrates the OPTIONAL GDDL record submission side effect of a completion.
//
// This is fire-and-forget from the completion handler: the completion has
// already been committed before this runs, and any failure here MUST NOT affect
// the completion result. The caller invokes this without awaiting (and with a
// .catch) so a slow/down GDDL never blocks or fails the write.
//
// CAVEAT (noted in the PR): true fire-and-forget on Lambda risks the runtime
// freezing the event loop after the HTTP response returns. A durable queue
// (e.g. SQS) is the proper long-term solution; it is out of scope here.

import prisma from '../utils/prisma'
import { decryptSecret } from '../utils/kms'
import { submitGddlRecord } from '../utils/gddl'
import { logger } from '../utils/logger'

export async function submitCompletionRecordToGddl(params: {
  userId: string
  progressUpdateId: string
  levelId: string
  videoUrl: string | null
}): Promise<void> {
  const { userId, progressUpdateId, levelId, videoUrl } = params

  // Only users with a configured GDDL key can submit. No key → nothing to do.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gddlApiKeyEncrypted: true },
  })
  if (!user?.gddlApiKeyEncrypted) return

  const apiKey = await decryptSecret(user.gddlApiKeyEncrypted)
  const { accepted } = await submitGddlRecord(apiKey, { levelId, videoUrl })

  // Record the acceptance state on the completion (unique per source).
  await prisma.recordAcceptance.upsert({
    where: {
      progressUpdateId_listSource: { progressUpdateId, listSource: 'GDDL' },
    },
    create: {
      progressUpdateId,
      listSource: 'GDDL',
      isAccepted: accepted,
      acceptedAt: accepted ? new Date() : null,
    },
    update: { isAccepted: accepted, acceptedAt: accepted ? new Date() : null },
  })

  logger.info({ userId, progressUpdateId, accepted }, 'GDDL record submitted')
}
