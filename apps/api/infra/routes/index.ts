/// <reference path="../../.sst/platform/config.d.ts" />

// Every api.route(...) registration lives in one of these modules. Importing
// them for their side effects is what declares the routes.
//
// Reminder: a new endpoint needs BOTH a Hono route in src/routes/*.ts AND an
// api.route(...) entry here — otherwise API Gateway 404s before Hono sees it.
import './account'
import './auth'
import './collections'
import './gddl'
import './importExport'
import './levels'
import './progress'
