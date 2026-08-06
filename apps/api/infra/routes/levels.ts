/// <reference path="../../.sst/platform/config.d.ts" />

import {
  api,
  authedRoute,
  jwtAuth,
  sharedEnvironment,
  sharedLinks,
} from '../api'
import { sharedNodeOptions } from '../defaults'

// ─────────────────────────────────────────────
// LEVELS — search/browse and the level-entry support endpoints.
//
// The routes that can reach RobTop share the global rate limiter
// (utils/robtopRateLimit.ts) with the level-seed worker's import-enrichment
// bursts, so they get an extended timeout rather than authedRoute's default:
// a request landing during one of those bursts can wait longer for a free
// slot than the default budget comfortably covers.
// ─────────────────────────────────────────────
const robtopRoute = (route: string) =>
  api.route(
    route,
    {
      handler: 'src/index.handler',
      link: sharedLinks,
      environment: sharedEnvironment,
      timeout: '25 seconds',
      ...sharedNodeOptions,
    },
    { auth: jwtAuth }
  )

authedRoute('GET /v1/levels/search')
// The /search page's cursor-paginated, filtered cache search. Cache-only
// (no RobTop), so the default timeout is fine.
authedRoute('GET /v1/levels/browse')
// The GD-server search escalation.
robtopRoute('GET /v1/levels/gd-search')
// API Gateway HTTP API path params use {brace} syntax; Hono's own routes
// keep :levelId. The actual request path is forwarded to Hono unchanged.
robtopRoute('GET /v1/levels/{levelId}/resolve')
// The Global Level Page's data source. Like /resolve it can hit RobTop on a
// cache miss.
robtopRoute('GET /v1/levels/{levelId}/page')
authedRoute('POST /v1/levels')
authedRoute('GET /v1/levels/{levelId}')
