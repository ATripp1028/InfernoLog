// The shared level cache — metadata for Geometry Dash levels, keyed by the
// in-game level id (a string, and the primary key: reuploads share it).
//
//   search.ts   GET  /v1/levels/search
//               GET  /v1/levels/browse
//               GET  /v1/levels/gd-search
//   resolve.ts  GET  /v1/levels/:levelId/resolve
//   detail.ts   GET  /v1/levels/:levelId/page
//               GET  /v1/levels/:levelId
//   create.ts   POST /v1/levels
//
// ⚠️ MOUNT ORDER IS LOAD-BEARING. Hono matches by registration order, not by
// static-segment priority: whichever route is registered first for a given
// path wins. `/levels/:levelId` in detail.ts matches ANY single segment, so
// mounting it before search.ts would silently swallow /levels/search,
// /levels/browse and /levels/gd-search — they'd match as levelId="search" etc.
// and fail LevelIdSchema with a confusing 400 "Level ID must be numeric"
// rather than an obvious 404.
//
// search.ts MUST stay above detail.ts. routing.test.ts pins this.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import { createErrorHandler } from '../../middleware/errors'
import searchRoutes from './search'
import resolveRoutes from './resolve'
import detailRoutes from './detail'
import createRoutes from './create'

const app = new Hono<{ Variables: HonoVariables }>()

// No domain error classes here — the level routes signal their expected
// failures with explicit responses (400 non-numeric id, 404 not found, 503
// GD unreachable), so anything that reaches this really is unexpected. The
// one exception, POST /levels' duplicate-id 409, is local to that handler.
app.onError(createErrorHandler('Levels'))

// Literal paths first.
app.route('/', searchRoutes)
// Then the parameterised ones, longest-specific first.
app.route('/', resolveRoutes)
app.route('/', detailRoutes)
// POST /levels — no path conflict with the above (different method + path).
app.route('/', createRoutes)

export default app
