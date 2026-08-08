/// <reference path="../../.sst/platform/config.d.ts" />

import { authedRoute } from '../api'

// ─────────────────────────────────────────────
// PROGRESS — the List page and per-level history, plus the entry-creation
// writes. (Completions live in infra/routes/gddl.ts: they need KMS access to
// optionally submit a GDDL record.)
// ─────────────────────────────────────────────
// The List page — the user's full level-progress list.
authedRoute('GET /v1/me/progress')
// Edit the most recent progress update + level metadata for an entry.
authedRoute('PATCH /v1/me/progress/{levelId}')
// Delete an entire level entry from the list.
authedRoute('DELETE /v1/me/progress/{levelId}')
// Delete a single logged entry (completion/progress/drop) for a level.
authedRoute('DELETE /v1/me/progress/{levelId}/updates/{progressUpdateId}')
// Level Page — the per-user view of a single level's full history.
authedRoute('GET /v1/me/progress/{levelId}')

// Progress and drop writes.
authedRoute('POST /v1/me/progress')
authedRoute('POST /v1/me/drops')

// ─────────────────────────────────────────────
// CLASSIC RANKING — the personal difficulty-ordering page.
// ─────────────────────────────────────────────
// Placed + unplaced columns in one payload; place / reorder / unplace.
authedRoute('GET /v1/me/ranking/classic')
authedRoute('POST /v1/me/ranking/classic')
authedRoute('PATCH /v1/me/ranking/classic/{levelProgressId}')
authedRoute('DELETE /v1/me/ranking/classic/{levelProgressId}')
