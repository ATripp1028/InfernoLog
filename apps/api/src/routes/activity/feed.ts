// GET /v1/me/activity — the Log page's merged feed.
//
// One page of activity_log events and progress_updates interleaved, newest
// first by recorded time. Filters and the keyset cursor arrive as query params;
// everything about the merge, the ordering and the RANKING_REBALANCE exclusion
// lives in services/activityLog/feed.ts.

import { Hono } from 'hono'
import { ActivityFeedQuerySchema } from '@infernolog/core'
import type { HonoVariables } from '../../types/hono'
import { readActivityFeed } from '../../services/activityLog/feed'

const app = new Hono<{ Variables: HonoVariables }>()

app.get('/me/activity', async (c) => {
  const userId = c.get('userId')
  const sp = new URL(c.req.url).searchParams

  // `kind` and `category` repeat rather than arriving comma-separated,
  // matching GET /v1/levels/browse's array params.
  const kinds = sp.getAll('kind')
  const categories = sp.getAll('category')
  const parsed = ActivityFeedQuerySchema.safeParse({
    kind: kinds.length > 0 ? kinds : undefined,
    category: categories.length > 0 ? categories : undefined,
    levelId: sp.get('levelId') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    cursor: sp.get('cursor') ?? undefined,
  })
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid query' },
      400
    )
  }

  const result = await readActivityFeed(userId, parsed.data)
  return c.json(result)
})

export default app
