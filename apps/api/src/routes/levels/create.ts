// POST /v1/levels — manual metadata write (the RobTop-fallback form submit).
//
// The user-entered difficulty BECOMES the level's in-game difficulty. That is
// the one sanctioned exception to in-game-difficulty-is-read-only, and it is
// why the row is marked data_source=manual / verified=false.
//
// The form submits a difficulty LABEL for every level, plus a STAR COUNT for a
// rated non-demon. Both, because neither determines the other: a face spans two
// counts (Hard is 4 or 5), and a count says nothing about which demon tier a
// 10-star level is. The count is the canonical identifier for a non-demon (see
// starDifficulty.ts), so the form asks for it rather than guessing a value the
// label cannot supply.

import { Hono } from 'hono'
import { ManualLevelInputSchema, faceMatchesStars } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { isUniqueViolation } from '../../middleware/errors'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import {
  levelDetailSelect,
  mapLevelDetail,
} from '../../services/levels/selects'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

app.post('/levels', async (c) => {
  const parsed = await parseJsonBody(c, ManualLevelInputSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  const isDemon = input.isDemon ?? false
  const isRated = input.isRated ?? false
  // Null for demons (every tier is 10 stars, so the count adds nothing the
  // label doesn't say) and for unrated levels (no stars awarded). Otherwise the
  // client's count is kept only if it agrees with the label it sent — both come
  // from one picker, so a mismatch means a malformed request, and storing a
  // count that contradicts the face would corrupt the canonical field.
  const claimed = input.stars ?? null
  const stars =
    isDemon || !isRated || claimed == null
      ? null
      : faceMatchesStars(input.difficulty, claimed)
        ? claimed
        : null

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
        stars,
        isDemon,
        isRated,
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
  return c.json({ data: mapLevelDetail(level) }, 201)
})

export default app
