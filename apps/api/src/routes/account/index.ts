// The authenticated user's own account — everything under /v1/me that isn't a
// resource of its own (progress, collections, ranking, list presets, import).
//
//   profile.ts    GET    /v1/me
//                 PATCH  /v1/me
//                 PATCH  /v1/me/username
//                 DELETE /v1/me
//   ratings.ts    GET    /v1/me/rating-categories
//                 PUT    /v1/me/rating-config
//   gddlKey.ts    PUT    /v1/me/gddl-key
//                 DELETE /v1/me/gddl-key
//   gddlSync.ts   POST   /v1/me/gddl-sync
//                 GET    /v1/me/gddl-sync
//                 POST   /v1/me/gddl-sync/ack
//                 POST   /v1/me/gddl-lists-sync
//   discord.ts    POST   /v1/me/connect-discord
//                 DELETE /v1/me/connect-discord
//
// serialize.ts holds the shared `me` select and its serializer — the single
// place that strips the stored GDDL key's ciphertext from responses.
//
// These routes have no cross-user counterpart by design: an account's own
// settings are not something another user reads. The planned public profile
// (GET /v1/users/{usernameOrId}) is a different, much narrower payload and
// belongs in routes/users.ts — see docs/API_DESIGN.md.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import { createErrorHandler } from '../../middleware/errors'
import profileRoutes from './profile'
import ratingsRoutes from './ratings'
import gddlKeyRoutes from './gddlKey'
import gddlSyncRoutes from './gddlSync'
import discordRoutes from './discord'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(createErrorHandler('Account'))

app.route('/', profileRoutes)
app.route('/', ratingsRoutes)
app.route('/', gddlKeyRoutes)
app.route('/', gddlSyncRoutes)
app.route('/', discordRoutes)

export default app
