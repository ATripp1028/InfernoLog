// POST /v1/levels — manual metadata write (the RobTop-fallback form submit).
//
// The user-entered difficulty BECOMES the level's in-game difficulty. That is
// the one sanctioned exception to in-game-difficulty-is-read-only, and it is
// why the row is marked data_source=manual / verified=false.

import { Hono } from 'hono'
import { ManualLevelInputSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { isUniqueViolation } from '../../middleware/errors'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import { levelDetailSelect } from '../../services/levels/selects'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

app.post('/levels', async (c) => {
  const parsed = await parseJsonBody(c, ManualLevelInputSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  // inGameId is the primary key, so a duplicate is a real user-facing case
  // (someone already added this level), not a server fault.
  let level
  try {
    level = await prisma.level.create({
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
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json({ error: 'Level already exists' }, 409)
    }
    throw error
  }

  logger.info({ inGameId: input.inGameId }, 'Manually created level metadata')
  return c.json({ data: level }, 201)
})

export default app
