// Saved List-page view configurations — a preset bundles the sorts, filters,
// visible columns, column order and the hideTime toggle so a user can switch
// between named views of their list.
//
//   presets.ts  GET    /v1/me/list-presets
//               POST   /v1/me/list-presets
//               PATCH  /v1/me/list-presets/:id
//               DELETE /v1/me/list-presets/:id
//
// One sub-resource, so one implementation file — the directory exists to keep
// every route module the same shape, not because this needs subdividing.
//
// Me-scoped: presets are private view state with no cross-user counterpart.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import presetRoutes from './presets'

const app = new Hono<{ Variables: HonoVariables }>()

app.route('/', presetRoutes)

export default app
