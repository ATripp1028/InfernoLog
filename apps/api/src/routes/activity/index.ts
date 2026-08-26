// Everything that READS the activity log:
//
//   feed.ts        GET /v1/me/activity
//   rankHistory.ts GET /v1/me/levels/{levelId}/rank-history
//
// The write half is services/activityLog, called from inside the transaction of
// each mutation it describes. Nothing here writes.
//
// Both routes are me-scoped: the user comes from the JWT (c.get('userId')),
// never from a path segment or payload. Neither has a cross-user equivalent —
// activity_log.visibility is inert and no public-profile route exists.
//
// Neither route has domain error classes of its own; the handler below is the
// generic log-report-500 tail every route module needs. See docs/EVENT_LOG.md.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import { createErrorHandler } from '../../middleware/errors'
import feedRoutes from './feed'
import rankHistoryRoutes from './rankHistory'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(createErrorHandler('Activity'))

app.route('/', feedRoutes)
app.route('/', rankHistoryRoutes)

export default app
