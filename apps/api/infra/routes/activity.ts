/// <reference path="../../.sst/platform/config.d.ts" />

import { authedRoute } from '../api'

// ─────────────────────────────────────────────
// ACTIVITY LOG — the Events page feed and the level-page rank history.
// Both read-only, both scoped to the authenticated user's own data.
// ─────────────────────────────────────────────
// The Events page — one keyset-paginated page of the merged event/progress feed.
authedRoute('GET /v1/me/activity')
// One level's position history in the user's classic demon list.
authedRoute('GET /v1/me/levels/{levelId}/rank-history')
