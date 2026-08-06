// POST /v1/levels — manual metadata write (the RobTop-fallback form submit).
//
// The user-entered difficulty BECOMES the level's in-game difficulty. That is
// the one sanctioned exception to in-game-difficulty-is-read-only, and it is
// why the row is marked data_source=manual / verified=false.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/node'
import { ManualLevelInputSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import { levelDetailSelect } from '../../services/levels/selects'

const app = new Hono<{ Variables: HonoVariables }>()

app.post('/levels', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ManualLevelInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const input = parsed.data

    const level = await prisma.level.create({
      data: {
        inGameId: input.inGameId,
        name: input.name,
        creator: input.creator,
        inGameDifficulty: input.difficulty,
        isDemon: input.isDemon ?? false,
        isRated: input.isRated ?? false,
        length: input.length ?? null,
        songName: input.songName ?? null,
        songAuthor: input.songAuthor ?? null,
        dataSource: 'manual',
        verified: false,
      },
      select: levelDetailSelect,
    })

    logger.info({ inGameId: input.inGameId }, 'Manually created level metadata')
    return c.json({ data: level }, 201)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return c.json({ error: 'Level already exists' }, 409)
    }
    console.error('POST /levels error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
