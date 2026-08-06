/// <reference path="../../.sst/platform/config.d.ts" />

import { authedRoute } from '../api'

// ─────────────────────────────────────────────
// COLLECTIONS — built-in (Want to Beat / Favorites / Least Favorites)
// and custom user collections of levels.
// ─────────────────────────────────────────────
authedRoute('GET /v1/me/collections')
authedRoute('POST /v1/me/collections')
authedRoute('GET /v1/me/collections/{collectionId}')
authedRoute('PATCH /v1/me/collections/{collectionId}')
authedRoute('DELETE /v1/me/collections/{collectionId}')
authedRoute('POST /v1/me/collections/{collectionId}/entries')
authedRoute('PATCH /v1/me/collections/{collectionId}/entries/{entryId}')
authedRoute('DELETE /v1/me/collections/{collectionId}/entries/{entryId}')

// ─────────────────────────────────────────────
// LIST PRESETS — saved view configurations for the List page.
// ─────────────────────────────────────────────
authedRoute('GET /v1/me/list-presets')
authedRoute('POST /v1/me/list-presets')
authedRoute('PATCH /v1/me/list-presets/{id}')
authedRoute('DELETE /v1/me/list-presets/{id}')
