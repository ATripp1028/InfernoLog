// POST /v1/me/gddl-records/:levelId — manually submit an existing completion
// to GDDL.
//
// This is the blocking counterpart to the `submitToGddl` flag on
// POST /v1/me/completions (see logging.ts): that path is fire-and-forget so a
// GDDL outage can never fail a completion write, which means the user gets no
// feedback when it doesn't land. This endpoint is the manual retry — it blocks
// and surfaces GDDL's error (422) so they know what happened.
//
// Lives here rather than under account/ with the other GDDL routes because it
// operates on one level's completion, reading the same LevelProgress and
// COMPLETION rows the rest of this module writes. The account-level GDDL
// routes (key management, bulk sync) are in routes/account/.
//
// Note GDDL records cannot be deleted through the GDDL API — see the caveat
// returned by DELETE /me/progress/:levelId in edits.ts.

import { Hono } from 'hono'
import prisma from '../../utils/prisma'
import { decryptSecret } from '../../utils/kms'
import { submitGddlRecord, GddlError } from '../../utils/gddl'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

app.post('/me/gddl-records/:levelId', async (c) => {
  const userId = c.get('userId')
  const levelId = c.req.param('levelId')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gddlApiKeyEncrypted: true },
  })
  if (!user?.gddlApiKeyEncrypted) {
    return c.json({ error: 'No GDDL API key configured' }, 400)
  }

  const lp = await prisma.levelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } },
    select: {
      userGddlTier: true,
      progressUpdates: {
        where: { kind: 'COMPLETION' },
        take: 1,
        select: {
          id: true,
          videoUrl: true,
          attempts: true,
          fps: true,
          enjoyment: true,
          twoPlayerSolo: true,
          device: true,
        },
      },
    },
  })
  const completion = lp?.progressUpdates[0] ?? null
  if (!completion) {
    return c.json({ error: 'No completion found for this level' }, 404)
  }

  const gddlTier = lp?.userGddlTier ?? null

  const apiKey = await decryptSecret(user.gddlApiKeyEncrypted)
  // GDDL rejecting the submission is a 422 the user can act on (bad video
  // link, duplicate record); anything else is ours and goes to onError.
  try {
    await submitGddlRecord(apiKey, {
      levelId,
      videoUrl: completion.videoUrl ?? null,
      attempts: completion.attempts ?? null,
      fps: completion.fps ?? null,
      enjoyment: completion.enjoyment ?? null,
      gddlTier,
      isSolo: completion.twoPlayerSolo ?? true,
      device: completion.device ?? null,
    })
  } catch (err) {
    if (err instanceof GddlError) {
      return c.json({ error: err.message }, 422)
    }
    throw err
  }

  logger.info({ userId, levelId }, 'GDDL record submitted manually')
  return c.json({ data: { submitted: true } }, 200)
})

export default app
