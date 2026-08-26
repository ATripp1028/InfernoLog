// GET /v1/me/levels/:levelId/rank-history — one level's position history in the
// authenticated user's classic ranking.
//
// The user's OWN level page only. There is deliberately no public equivalent:
// activity_log.visibility is inert, and a ranking is personal data. The
// reconstruction — and why it walks backwards from the present — lives in
// services/activityLog/rankHistory.ts.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import { readRankHistory } from '../../services/activityLog/rankHistory'

const app = new Hono<{ Variables: HonoVariables }>()

app.get('/me/levels/:levelId/rank-history', async (c) => {
  const userId = c.get('userId')
  const levelId = c.req.param('levelId')

  const result = await readRankHistory(userId, levelId)
  return c.json(result)
})

export default app
