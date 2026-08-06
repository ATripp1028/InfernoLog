// Moving a whole account's data in and out.
//
//   import.ts  POST  /v1/me/import/check
//              POST  /v1/me/import/start
//              GET   /v1/me/import/status
//              PATCH /v1/me/import/rows/:rowId/resolve
//              POST  /v1/me/import/resolve-all
//   export.ts  GET   /v1/me/export
//
// Two sibling URL branches (/me/import/* and /me/export) kept in one module
// because they are one feature: the export shape is defined by what the import
// can read back, and changing either without the other breaks the round-trip
// identity the design depends on. See docs/IMPORT_EXPORT.md.
//
// Me-scoped. A cross-user export (GET /v1/users/{usernameOrId}/export) is
// deferred — whether another user's data is exportable at all is an open
// privacy question, not a settled design.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import importRoutes from './import'
import exportRoutes from './export'

const app = new Hono<{ Variables: HonoVariables }>()

app.route('/', importRoutes)
app.route('/', exportRoutes)

export default app
