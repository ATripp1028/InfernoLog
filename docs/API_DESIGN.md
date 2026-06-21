# InfernoLog — Public API Design

## Overview

InfernoLog exposes a public REST API for community developers and first-party integrations (including the planned Geode mod). The API is versioned, rate-limited, and documented via an OpenAPI spec.

Interactive documentation is available at `api.infernolog.gg/docs`.

---

## Versioning

All routes are prefixed with `/v1/`. Breaking changes will be introduced under `/v2/` with a deprecation period for v1. This convention is established from day one regardless of current traffic.

---

## Authentication

### Public Routes (No Auth)
Read endpoints for public user profiles require no authentication.

### User Auth (Cognito JWT)
First-party frontend operations use Cognito JWTs passed as `Authorization: Bearer <token>`. These cover all write operations initiated by the user themselves.

### API Key Auth (Third-Party)
Third-party tools pass their API key as `X-InfernoLog-Key: <key>`. The key is validated server-side, resolved to a user + scope set, and the request proceeds if the required scope is present.

---

## Rate Limiting

API Gateway enforces per-key rate limits. Unauthenticated public read requests are rate-limited by IP. Specific limits are TBD based on observed usage patterns during beta.

---

## Privacy Enforcement

- Private profiles return **HTTP 403 Forbidden** on all endpoints, including read endpoints
- 403 (not 404) is used to distinguish "exists but private" from "does not exist"
- Moderators and admins can access private profiles via internal admin routes, not the public API

---

## Pagination

All list endpoints use **cursor-based pagination**. Offset pagination is not used, as rankings shift frequently and offset results become stale.

Standard response shape for paginated endpoints:

```json
{
  "data": [...],
  "cursor": "opaque_cursor_string",
  "hasMore": true
}
```

Pass `?cursor=<value>` to fetch the next page.

---

## Endpoints

### Levels

```
GET  /v1/levels/{levelId}
GET  /v1/levels/{levelId}/resolve
GET  /v1/levels/search?q={query}
POST /v1/levels
```

- `GET /v1/levels/{levelId}` — Returns cached level metadata from the InfernoLog levels cache. Does **not** call the GD servers live. 404 if not cached.
- `GET /v1/levels/{levelId}/resolve` — The autofill endpoint that fires on level-ID entry in the logging modal. Cache hit returns the cached level; cache miss calls the GD servers once and writes the result into the cache (`data_source = robtop_autofill`, `verified = true`, including the `is_demon` flag). If the GD servers are unavailable or return nothing, responds `200` with `{ level: null, fallbackToManual: true }` — never a `500` (GD-server unavailability is an expected branch, not an error). Also returns: `suggestedGddlTier` (GDDL's suggested tier for rated levels, to pre-fill the list-references step — `null` when unavailable; fetching it never blocks the resolve), and `existingCompletion` (the authed user's existing completion for this level, or `null`) so the client can pre-populate the edit form ("edit, not replace").
- `GET /v1/levels/search?q=` — Fuzzy/typo-tolerant level **name** search over the cache via a `pg_trgm` GIN index (not the GD servers' live search). Returns `{ inGameId, name, creator, inGameDifficulty, featured, epicValue }` per result. Empty array on a cold cache.
- `POST /v1/levels` — Manual metadata write (the autofill-fallback form submit). Creates the level with `data_source = manual`, `verified = false`. The user-entered difficulty **becomes** the level's `in_game_difficulty` (the one sanctioned exception to in-game-difficulty-is-read-only). `409` if the level already exists.

---

### Users

```
GET  /v1/users/{usernameOrId}
```
Returns public profile data. 403 if private. Accepts both username and UUID — username is resolved to UUID server-side.

---

### Progress

**Reads** (list + per-level detail):

```
GET    /v1/users/{usernameOrId}/progress
GET    /v1/users/{usernameOrId}/progress/{levelId}
```

- `GET` (list): Paginated. Sortable by any logged metric via `?sort=` and `?order=` params. Filterable by list source, tier range, date range.

**Writes** — per-action, me-scoped (the authenticated user always comes from the
Cognito JWT, never from the path or payload):

```
POST   /v1/me/completions
POST   /v1/me/progress
POST   /v1/me/drops
```

The original spec had a single generic `POST /v1/users/{usernameOrId}/progress`.
It is replaced by these three per-action routes because the payloads differ
structurally. All three resolve-or-create the same underlying `level_progress`
row for the user+level, then apply the action:

- `POST /v1/me/completions` — Creates **or edits** the user's completion. Idempotent: if a completion already exists for the level it is **updated in place** (edit-not-replace), never duplicated — exactly one `is_completion = true` per `level_progress`. 100% is implied (no percentage / run-range). `in_game_difficulty` is snapshotted from the cached level, never accepted from the client. Carries date (+uncertain), attempts, `difficulty_opinion`, rating (`simpleRating` OR per-category `ratingScores`), enjoyment, `listReferences` (GDDL / AREDL / NLW / OTHER), session details, an optional non-blocking GDDL record submission (`submitToGddl`), and an optional self-reported `gddlRecordAccepted` toggle (upserts the GDDL record-acceptance row).
- `POST /v1/me/progress` — Creates a non-completion progress update. Discriminated on `mode`: `from_zero` (single best `percentage`, floor 0) or `from_run` (`runFrom` / `runTo` segment, 0–100). Logging progress on a **dropped** level flips it back to `in_progress` (see `LOGGING_FLOW_RECONCILIATION.md`).
- `POST /v1/me/drops` — Sets `level_progress.status = dropped` with optional `droppedAt`, `attemptsAtDrop`, `droppedReason`, and per-entry `visibility`. Drop-from-scratch is allowed (a level the user has never logged).

Each write returns the full resulting record (`{ levelProgress, progressUpdate }`)
so the client can update the UI without a follow-up `GET`. Writes are own-account
only; the JWT identity is authoritative.

`PATCH` / `DELETE` of individual progress updates, and the read endpoints above,
are out of scope for the entry-creation work and unchanged here.

---

### Lists (Custom, Favorites, Least Favorites)

```
GET    /v1/users/{usernameOrId}/lists
GET    /v1/users/{usernameOrId}/lists/{listId}
POST   /v1/users/{usernameOrId}/lists
PATCH  /v1/users/{usernameOrId}/lists/{listId}
DELETE /v1/users/{usernameOrId}/lists/{listId}
```

---

### Rankings

```
GET  /v1/users/{usernameOrId}/ranking/classic
GET  /v1/users/{usernameOrId}/ranking/platformer
```

Returns the user's personal difficulty ranking in order. Supports `?includeUnrated=true/false`. Paginated.

---

## API Key Management (Authenticated) *(v3)*

Not implemented in v1 or v2. Introduced in v3 alongside the Geode mod. These routes are first-party only (Cognito JWT). Not part of the public API surface for third-party tools.

```
GET    /v1/me/api-keys
POST   /v1/me/api-keys
DELETE /v1/me/api-keys/{keyId}
POST   /v1/me/api-keys/{keyId}/rotate
```

---

## Export

```
GET  /v1/users/{usernameOrId}/export
```

Returns a `.xlsx` file of the user's completion log. Query params control whether the export reflects the current filtered view or the full unfiltered log (`?filtered=true/false`). Always includes all list references. Requires Cognito JWT (own account only).

---

## OpenAPI Spec

The OpenAPI spec (`openapi.yaml`) is the source of truth for the API contract. The frontend uses `openapi-typescript` to auto-generate TypeScript types from this spec. The backend implements against it.

Any API change requires updating the spec first, then implementing. This enforces spec-first development.

---

## Geode Mod Considerations

The Geode mod (future) communicates with InfernoLog exclusively via this public API using a user's API key. The mod's primary use cases map to existing endpoints:

- Auto-log a completion on level complete: `POST /v1/me/completions` (own account via JWT; `progress:write` scope for the future API-key path)
- Read attempt count from the game natively (GD exposes this), pass in request body

The API is designed with a native client in mind. No mod-specific endpoints are needed — the general API surface covers all planned mod functionality.
