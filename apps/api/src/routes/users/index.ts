// Public (unauthenticated) routes about users other than "the caller".
//
//   checkUsername.ts  GET /v1/users/check-username
//
// Mounted on /v1 in src/index.ts BEFORE authMiddleware — the username check
// runs during sign-up, before a User row (or even a confirmed Cognito identity)
// exists, so it must not require a token.
//
// This is where the planned public profile reads land:
// GET /v1/users/{usernameOrId} and the cross-user progress/collections/ranking
// reads, which resolve the subject from the path and enforce profilePublic
// plus per-entry visibility. Those are reads only — every write stays on /me,
// where the JWT is authoritative. See docs/API_DESIGN.md.
//
// ⚠️ When GET /v1/users/{usernameOrId} is added, it must be mounted AFTER
// checkUsername: Hono matches by registration order, not static-over-param, so
// a {usernameOrId} route registered first would swallow /users/check-username
// as a username lookup. Same hazard as routes/levels/ — see its routing.test.ts.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import checkUsernameRoutes from './checkUsername'

const app = new Hono<{ Variables: HonoVariables }>()

app.route('/', checkUsernameRoutes)

export default app
