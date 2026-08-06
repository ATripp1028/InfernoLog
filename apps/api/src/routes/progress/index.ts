// Everything under /v1/me/progress, plus the two sibling write paths that
// create progress rows (/me/completions, /me/drops).
//
//   list.ts       GET    /v1/me/progress
//   levelPage.ts  GET    /v1/me/progress/:levelId
//   logging.ts    POST   /v1/me/completions
//                 POST   /v1/me/progress
//                 POST   /v1/me/drops
//   edits.ts      PATCH  /v1/me/progress/:levelId
//                 DELETE /v1/me/progress/:levelId
//                 DELETE /v1/me/progress/:levelId/updates/:progressUpdateId
//
// The reads and the writes used to live in two unrelated files (progress.ts and
// logging.ts), which put GET /me/progress and POST /me/progress in different
// places. They are one resource and belong together.
//
// All routes are me-scoped: the user comes from the JWT (c.get('userId')),
// never from a path segment or payload. The planned cross-user reads
// (GET /v1/users/{usernameOrId}/progress) will land here as a public.ts
// sibling — see docs/API_DESIGN.md.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import listRoutes from './list'
import levelPageRoutes from './levelPage'
import loggingRoutes from './logging'
import editRoutes from './edits'

const app = new Hono<{ Variables: HonoVariables }>()

app.route('/', listRoutes)
app.route('/', levelPageRoutes)
app.route('/', loggingRoutes)
app.route('/', editRoutes)

export default app
