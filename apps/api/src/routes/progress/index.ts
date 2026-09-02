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
//   gddlRecord.ts POST   /v1/me/gddl-records/:levelId
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
import { createErrorHandler } from '../../middleware/errors'
import {
  CompletionFieldsNotApplicableError,
  LevelNotFoundError,
  ProgressFieldsNotApplicableError,
  RatingCategoryNotOwnedError,
} from '../../services/progress'
import listRoutes from './list'
import levelPageRoutes from './levelPage'
import loggingRoutes from './logging'
import editRoutes from './edits'
import gddlRecordRoutes from './gddlRecord'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(
  createErrorHandler('Progress', (error, c) => {
    // All four are client-sequencing / client-input errors, not server
    // faults: writing against a level that was never resolved into the cache,
    // putting percentage/runFrom/runTo on an update that isn't kind=PROGRESS,
    // putting completion-only fields on one that isn't kind=COMPLETION, and
    // naming a rating category owned by someone else.
    if (
      error instanceof LevelNotFoundError ||
      error instanceof ProgressFieldsNotApplicableError ||
      error instanceof CompletionFieldsNotApplicableError ||
      error instanceof RatingCategoryNotOwnedError
    ) {
      return c.json({ error: error.message }, 400)
    }
    return undefined
  })
)

app.route('/', listRoutes)
app.route('/', levelPageRoutes)
app.route('/', loggingRoutes)
app.route('/', editRoutes)
app.route('/', gddlRecordRoutes)

export default app
