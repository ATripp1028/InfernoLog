// POST /v1/me/gddl-records/:levelId — manually submit an existing completion
// to GDDL. Unlike the fire-and-forget path triggered during completion logging,
// this endpoint blocks and surfaces errors so the user gets feedback.

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
import { decryptSecret } from '../utils/kms'
import { submitGddlRecord, GddlError } from '../utils/gddl'
import { logger } from '../utils/logger'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

app.post('/me/gddl-records/:levelId', async (c) => {
  const userId = c.get('userId') as string
  const levelId = c.req.param('levelId')

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gddlApiKeyEncrypted: true },
    })
    if (!user?.gddlApiKeyEncrypted) {
      return c.json({ error: 'No GDDL API key configured' }, 400)
    }

    const completion = await prisma.progressUpdate.findFirst({
      where: {
        levelProgress: { userId, levelId },
        isCompletion: true,
      },
      select: {
        id: true,
        videoUrl: true,
        attempts: true,
        fps: true,
        enjoyment: true,
        listReferences: {
          where: { listSource: 'GDDL' },
          select: { tierOrRank: true },
          take: 1,
        },
      },
    })
    if (!completion) {
      return c.json({ error: 'No completion found for this level' }, 404)
    }

    const gddlTierRaw = completion.listReferences[0]?.tierOrRank ?? null
    const gddlTierParsed =
      gddlTierRaw != null ? parseInt(gddlTierRaw, 10) : null
    const gddlTier =
      gddlTierParsed != null && !Number.isNaN(gddlTierParsed)
        ? gddlTierParsed
        : null

    const apiKey = await decryptSecret(user.gddlApiKeyEncrypted)
    await submitGddlRecord(apiKey, {
      levelId,
      videoUrl: completion.videoUrl ?? null,
      attempts: completion.attempts ?? null,
      fps: completion.fps ?? null,
      enjoyment: completion.enjoyment ?? null,
      gddlTier,
    })

    logger.info({ userId, levelId }, 'GDDL record submitted manually')
    return c.json({ data: { submitted: true } }, 200)
  } catch (err) {
    if (err instanceof GddlError) {
      return c.json({ error: (err as Error).message }, 422)
    }
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
