# InfernoLog — API Design

## Overview

InfernoLog's backend is a Hono app on AWS Lambda behind an API Gateway v2 HTTP API. Today it serves the first-party frontend only. The longer-term intent is a public REST API for community developers and first-party integrations (including the planned Geode mod).

**This document tracks both.** Every endpoint block is marked:

- **Live** — implemented and deployed. Reflects the code as of 2026-08-06.
- **Planned** — designed but not implemented. No handler exists.

Anything not marked is prose that applies to both.

> **Route registration:** adding an endpoint requires **two** changes — a Hono route in `apps/api/src/routes/*.ts` **and** a matching `api.route(...)` entry in `apps/api/sst.config.ts`. API Gateway 404s before Hono sees the request otherwise. `sst.config.ts` is the exhaustive list of the live surface.

---

## Versioning

All application routes are prefixed with `/v1/`. Breaking changes will be introduced under `/v2/` with a deprecation period for v1. This convention is established from day one regardless of current traffic.

Two live routes sit outside the version prefix by design: `GET /health` and `GET /auth/discord/callback` (the OAuth redirect target, whose URL is registered with Discord and should not carry a version that could change).

---

## Authentication

### Cognito JWT (live)

The first-party frontend passes a Cognito ID token as `Authorization: Bearer <token>`. `apps/api/src/middleware/auth.ts` verifies it with `aws-jwt-verify`, looks the user up by `googleId` (the Cognito `sub`), and sets `userId` (internal UUID) and `userEmail` on the Hono context. Handlers must use `c.get('userId')` — never the Cognito sub directly.

The middleware is mounted on `/v1/*`, so **every `/v1` route is authenticated** unless it is registered before the middleware in `src/index.ts`. Today that carve-out is exactly two things:

- `GET /v1/users/check-username` — registered inline in `index.ts`
- `POST /v1/auth/signup/start` and `POST /v1/auth/signin/reject` — "claims-only" routes that verify the Cognito token but tolerate a missing `User` row, since they run before one exists

Note this means the `/v1/levels/*` read endpoints are **currently authenticated**, even though they expose no per-user data and are intended to become public reads. Opening them up is a deliberate future change, not an oversight to fix incidentally.

### API Key (planned — v3)

Third-party tools would pass an API key as `X-InfernoLog-Key: <key>`, validated server-side and resolved to a user + scope set. **Not implemented.** No key issuance, storage, validation, or scope enforcement exists today. The `ApiKey` model exists in `schema.prisma` but nothing reads or writes it.

---

## Rate Limiting

**Planned.** No per-key or per-IP rate limiting is enforced at the API layer today. Specific limits are TBD based on observed usage during beta.

The one live limiter is unrelated to inbound traffic: `apps/api/src/utils/robtopRateLimit.ts` throttles InfernoLog's **outbound** calls to the GD servers, shared across the `resolve`, `page`, and `gd-search` paths.

---

## Privacy Enforcement

**Planned.** The rules below describe the cross-user read endpoints, none of which exist yet. Every live endpoint is own-account only, scoped by JWT.

- Private profiles return **HTTP 403 Forbidden** on all endpoints, including reads
- 403 (not 404) is used to distinguish "exists but private" from "does not exist"
- Moderators and admins access private profiles via internal admin routes, not the public API

The data model is already in place: `User.profilePublic`, `User.discordPublic`, and a per-entry visibility override independent of the profile-level flag (see `schema.prisma` and `PRIVACY.md`). Owner-scoped reads deliberately ignore all of it — `GET /v1/me/progress` returns `PRIVATE` entries because you are looking at your own data.

---

## Pagination

Cursor-based (keyset) pagination is the standard for **new** list endpoints. Offset pagination is avoided where ordering shifts frequently.

```json
{ "data": [...], "cursor": "opaque_cursor_string", "hasMore": true }
```

This is **not** universal today, and the exceptions are intentional:

| Endpoint | Scheme | Why |
| --- | --- | --- |
| `GET /v1/levels/browse` | cursor (keyset) | The standard. Stable ordering over a large cache. |
| `GET /v1/me/export` | `offset` + `limit` | Section-by-section full drain; the client stitches the file. Stable snapshot, order-insensitive. |
| `GET /v1/me/progress` | **none** — full payload | The List page wants every row in hand for client-side filtering and a live match counter. Hundreds to low thousands of rows for one user. |
| `GET /v1/me/ranking/classic` | **none** — full payload | Returns placed and unplaced columns together; the ranking UI is a drag-and-drop board over the whole set. |
| `GET /v1/levels/search` | **none** — `LIMIT 20` | Typeahead. |
| `GET /v1/levels/gd-search` | **none** — first page only | One upstream GD query; never paginated (see below). |

---

# Live Endpoints

The 57 routes currently deployed, grouped as they are mounted.

## Health

```
GET  /health                                    (no auth)
```

Returns `{ status: 'ok', app: 'InfernoLog' }`.

---

## Auth & Onboarding

```
GET   /auth/discord/callback                    (no auth — signed state instead)
POST  /v1/auth/signup/start                     (claims-only)
POST  /v1/auth/signin/reject                    (claims-only)
POST  /v1/me/connect-discord
DELETE /v1/me/connect-discord
```

- `POST /v1/auth/signup/start` — Creates the InfernoLog `users` row for a confirmed, age-gated sign-up. Idempotent: a double-submit for the same Cognito identity returns the already-created row rather than erroring, which also covers a Google account that already has an InfernoLog account going through Sign Up by mistake. Returns `onboardingCompleted` so the frontend knows whether to route into the wizard or straight into the app.
- `POST /v1/auth/signin/reject` — Called when a Sign In attempt finds no matching InfernoLog user for the just-completed Google OAuth identity. Synchronously deletes the Cognito user so no trace of the attempt persists. Load-bearing for the COPPA argument that a rejected sign-in never retains a would-be user's data — neither this handler nor the app-wide request logger logs the claims payload, only the `sub`.
- `POST /v1/me/connect-discord` — Returns a Discord OAuth URL carrying a signed state that encodes the signed-in user's id. The browser navigates there; Discord redirects to the public callback.
- `GET /auth/discord/callback` — Public because Discord calls it. The signed state is what proves which signed-in user initiated the flow; it is validated before `discordId` is written.

> **Note:** a `User` row is also created lazily by the Cognito post-authentication trigger (`src/triggers/postAuthentication.ts`), which seeds default rating categories and the built-in collections. The signup route and the trigger are two paths to the same row.

## Users

```
GET  /v1/users/check-username?username=         (no auth)
```

Returns `{ available: boolean }`.

> ⚠️ **Known defect.** This path is registered **twice**: inline in `src/index.ts` (before `authMiddleware`) and again in `src/routes/me.ts`. Hono resolves to the first registration, so the `me.ts` handler is unreachable dead code. The two differ: the live one checks only case-insensitive uniqueness, while the dead one additionally validates format (2–32 chars, `[A-Za-z0-9_-]`) and rejects reserved names (`admin`, `moderator`, `infernolog`). **The reachable endpoint therefore reports reserved and malformed usernames as available.** `PATCH /v1/me/username` does enforce the full rules, so this is a client-side-hint gap rather than a data-integrity hole — but the endpoint should be deduplicated onto the stricter implementation.

## Levels

```
GET  /v1/levels/search?q=
GET  /v1/levels/browse
GET  /v1/levels/gd-search
GET  /v1/levels/{levelId}
GET  /v1/levels/{levelId}/resolve
GET  /v1/levels/{levelId}/page
POST /v1/levels
```

Route order matters: `/search`, `/browse`, and `/gd-search` are declared before `/{levelId}` so Hono does not capture the literal segment as an id.

- `GET /v1/levels/{levelId}` — Cached level metadata from the InfernoLog levels cache. Does **not** call the GD servers. 404 if not cached.
- `GET /v1/levels/{levelId}/resolve` — The autofill endpoint that fires on level-ID entry in the logging modal. Cache hit returns the cached level; cache miss calls the GD servers once and writes the result into the cache (`data_source = robtop_autofill`, `verified = true`, including the `is_demon` flag). If the GD servers are unavailable or return nothing, responds `200` with `{ level: null, fallbackToManual: true }` — never a `500` (GD-server unavailability is an expected branch, not an error). Also returns `suggestedGddlTier` (GDDL's suggested tier for rated levels, to pre-fill the list-references step — `null` when unavailable; fetching it never blocks the resolve) and `existingCompletion` (the authed user's existing completion, or `null`) so the client can pre-populate the edit form ("edit, not replace").
- `GET /v1/levels/{levelId}/page` — The Global Level Page's data source. Unlike the bare cached-only `GET` above, a cache miss here resolves from the GD servers (autofill + Song File Hub lookup) and caches it. The two failure modes are kept distinct so the page can branch: `404 { reason: 'not_found' }` (GD has no such level — terminal, nothing cached, so a later visit re-resolves) and `503 { reason: 'unreachable' }` (GD couldn't be reached — retryable).
- `GET /v1/levels/search?q=` — Fuzzy/typo-tolerant level **name** search over the cache via a `pg_trgm` GIN index (not the GD servers' live search). Two complementary index-supported matchers: `ILIKE '%q%'` so short fragments like "Cat" surface "Cataclysm" (the `%` similarity operator alone needs ~4 characters of a long name to clear pg_trgm's 0.3 threshold), and `name % q` for typo tolerance ("Cataclism"). Ordered by similarity, `LIMIT 20`. Empty array on a cold cache.
- `GET /v1/levels/browse` — The `/search` page's cursor-paginated, filtered cache search. Filters, sort, and cursor come from the query string (arrays as repeated params); delegates to `services/levelBrowse.ts`.
- `GET /v1/levels/gd-search` — The opt-in GD-server search escalation. One `getGJLevels21` query (**first page only — never cursor-paginated**), cache dedupe, rated/unrated partition, and automatic seeding of rated survivors (`services/gdSearch.ts`). Fired only on explicit user confirmation from a cache-search UI, never on keystroke. The `/search` page's filters and sort are forwarded where GD's schema permits, so an empty query is valid as long as there is a forwardable filter or a downloads/likes sort to browse by. Shares the outbound RobTop rate limiter, hence the extended Lambda timeout in `sst.config.ts`.
- `POST /v1/levels` — Manual metadata write (the autofill-fallback form submit). Creates the level with `data_source = manual`, `verified = false`. The user-entered difficulty **becomes** the level's `in_game_difficulty` (the one sanctioned exception to in-game-difficulty-is-read-only). `409` if the level already exists.

## Progress

**Reads:**

```
GET  /v1/me/progress
GET  /v1/me/progress/{levelId}
```

- `GET /v1/me/progress` — Backs the List page. Returns the authenticated user's **entire** level-progress list in one payload (both `PUBLIC` and `PRIVATE` entries), shaped per `LevelProgressListItemSchema` in `@infernolog/core`. Each row carries the trimmed level metadata, the **representative** progress update (the completion update when `status = completed`, otherwise the most recent), its `listReferences`, a query-time-computed `overallRating` (simpleRating in SIMPLE mode; weighted average of `ratingScores` in WEIGHTED mode — see `RATING_SYSTEM.md`), and a derived `needsPlacement` flag (a completed classic level with no `ClassicRanking` row). **No query params:** all filtering, multi-key sorting, and column selection happen client-side.
- `GET /v1/me/progress/{levelId}` — The Level Page payload: `level_progress` fields, level metadata, **all** progress updates (with list references and rating scores, newest-first), the `classicRanking` placement, and the computed `runsGraph` array (`utils/runsGraph.ts`). The Level Page timeline shows complete history without the "show non-completions" toggle — that toggle governs The List and The Ranking only.

**Writes** — per-action and me-scoped. The authenticated user always comes from the Cognito JWT, never from the path or payload:

```
POST   /v1/me/completions
POST   /v1/me/progress
POST   /v1/me/drops
PATCH  /v1/me/progress/{levelId}
DELETE /v1/me/progress/{levelId}
DELETE /v1/me/progress/{levelId}/updates/{progressUpdateId}
```

An earlier spec had a single generic `POST /v1/users/{usernameOrId}/progress`. It was replaced by the three per-action creates because the payloads differ structurally. All three resolve-or-create the same underlying `level_progress` row for the user+level, then apply the action:

- `POST /v1/me/completions` — Creates **or edits** the user's completion. Idempotent: if a completion already exists for the level it is **updated in place** (edit-not-replace), never duplicated — exactly one `kind = completion` per `level_progress`. 100% is implied (no percentage / run-range). `in_game_difficulty` is snapshotted from the cached level, never accepted from the client. Carries date (+uncertain), attempts, `difficulty_opinion`, rating (`simpleRating` **or** per-category `ratingScores`), enjoyment, `listReferences` (GDDL / AREDL / NLW / OTHER), session details, an optional non-blocking GDDL record submission (`submitToGddl`), and an optional self-reported `gddlRecordAccepted` toggle (upserts the GDDL record-acceptance row).
- `POST /v1/me/progress` — Creates a non-completion progress update (`kind = progress`). Discriminated on `mode`: `from_zero` (single best `percentage`, floor 0) or `from_run` (`runFrom` / `runTo` segment, 0–100). Logging progress on a **dropped** level flips it back to `in_progress` (see `LOGGING_FLOW_RECONCILIATION.md`).
- `POST /v1/me/drops` — Creates a `kind = drop` progress update with optional `date`, `attempts`, `notes`, and per-entry `visibility` (the same fields every progress update uses, not drop-specific ones), and sets `level_progress.status = dropped`. Drop-from-scratch is allowed (a level the user has never logged), and a level can be dropped more than once — each drop is its own row.
- `PATCH /v1/me/progress/{levelId}` — Edits the most recent progress update and/or the `LevelProgress` metadata. All fields optional; only present keys are written. "Most recent" is the completion if one exists, then by `loggedAt` desc — matching the Level Page's display order.
- `DELETE /v1/me/progress/{levelId}` — Deletes the whole entry: every progress update (and their rating scores / list references) plus the `ClassicRanking` row, per the schema's `onDelete: Cascade` relations. **GDDL caveat:** GDDL records cannot be deleted through the GDDL API; users must remove them on the GDDL platform directly. This is stated in the response body so the frontend can surface it in the delete confirmation.
- `DELETE /v1/me/progress/{levelId}/updates/{progressUpdateId}` — Removes a single logged entry rather than the whole level. Deleting the last remaining update deletes the entire `level_progress` instead.

Each create returns the full resulting record (`{ levelProgress, progressUpdate }`) so the client can update the UI without a follow-up `GET`.

## Collections (Want to Beat, Favorites, Least Favorites, Custom)

```
GET    /v1/me/collections
POST   /v1/me/collections
GET    /v1/me/collections/{collectionId}
PATCH  /v1/me/collections/{collectionId}
DELETE /v1/me/collections/{collectionId}
POST   /v1/me/collections/{collectionId}/entries
PATCH  /v1/me/collections/{collectionId}/entries/{entryId}
DELETE /v1/me/collections/{collectionId}/entries/{entryId}
```

Own-account only. Validation returns machine-readable codes: `DUPLICATE_NAME` (409), `RESERVED_NAME` (422), `BUILT_IN_COLLECTION` (403 — edit or delete of a built-in), `LEVEL_ALREADY_COMPLETED` (409 — adding a completed level to Want to Beat). Adding an already-present level is an idempotent no-op. Entry reorder sends the two neighbour entry ids (`prevId` / `nextId`); the server computes the fractional midpoint and renormalises when the gap underflows (`utils/fractionalIndex.ts`).

Want to Beat holds only unbeaten levels — every completion write path calls `removeFromWantToBeat` inside its transaction.

> Do not confuse **collections** (`Collection` / `CollectionEntry` — user-owned groupings) with **list references** (`ListReference` / `ListSource` — GDDL/AREDL/NLW community difficulty-list tiers attached to a completion). Unrelated concepts.

## Rankings

```
GET    /v1/me/ranking/classic
POST   /v1/me/ranking/classic
PATCH  /v1/me/ranking/classic/{levelProgressId}
DELETE /v1/me/ranking/classic/{levelProgressId}
```

- `GET` — Returns both the placed and unplaced columns in one payload. No pagination, no query params.
- `POST` — Place an unplaced completion.
- `PATCH` — Reorder a placed entry.
- `DELETE` — Unplace, returning it to the panel.

All ordering and fractional-indexing logic lives in `services/ranking.ts`; the handlers only parse, dispatch, and map service errors to status codes. Platformer ranking is not implemented (see Planned).

## Rating Configuration

```
GET  /v1/me/rating-categories
PUT  /v1/me/rating-config
```

`PUT /v1/me/rating-config` atomically replaces the user's weighted-rating configuration in a single transaction. Granular per-category endpoints were deliberately removed: the sum-must-equal-target invariant makes single-row mutations impossible to validate in isolation — you cannot change one weight without changing another. The editor submits the full config; the server diffs it against existing rows and applies create/update/delete in one transaction.

Ratings are stored as integers 0–100 internally regardless of `user.ratingDisplayScale`; conversion happens at the display layer.

## Account & Settings

```
GET    /v1/me
PATCH  /v1/me
PATCH  /v1/me/username
DELETE /v1/me
```

- `GET /v1/me` — The authenticated user plus rating categories. `gddlApiKeyEncrypted` is destructured out server-side and replaced by a derived `hasGddlApiKey` boolean; the ciphertext never reaches a client. `verifiedAt` is likewise reduced to `isVerified`.
- `PATCH /v1/me` — Partial update of user preferences (privacy, logging defaults, rating mode, display options).
- `PATCH /v1/me/username` — Separate from `PATCH /v1/me` because it carries a 30-day cooldown and a uniqueness check.
- `DELETE /v1/me` — Full account purge, then the Cognito user. Most relations cascade from the `users` delete, but several are removed explicitly first: the moderation tables (`ON DELETE RESTRICT`, an intentional audit-trail protection), `GddlSyncJob` (no declared FK to `users`), and `RatingScore` (its `categoryId → RatingCategory` FK has no `onDelete` action, and Postgres validates it before the cascade from `LevelProgress → ProgressUpdate` is guaranteed to have run — P2003 otherwise). Requires a literal `confirmation: "Delete this account"` in the body.

## GDDL Integration

```
PUT    /v1/me/gddl-key
DELETE /v1/me/gddl-key
POST   /v1/me/gddl-sync
GET    /v1/me/gddl-sync
POST   /v1/me/gddl-sync/ack
POST   /v1/me/gddl-lists-sync
POST   /v1/me/gddl-records/{levelId}
```

- `PUT /v1/me/gddl-key` — Stores or replaces the user's GDDL API key. Encrypted with AWS KMS before it touches the database and **never logged**. Returns only the derived `hasGddlApiKey` flag. The key is verified against GDDL before being stored.
- `POST /v1/me/gddl-sync` — Creates an async sync job and returns `202` + `jobId` immediately; the work runs in the `GddlSyncWorker` Lambda so API Gateway's 29-second integration timeout never applies regardless of how many GDDL pages / RobTop lookups are needed. Only one job may be active per user: if one is pending, this returns its id rather than starting a second. Idempotent under double-clicks and multiple tabs.
- `GET /v1/me/gddl-sync` — The current or most-recent job while it is still relevant: pending, or completed/failed but not yet acknowledged. No job id needed, so the frontend can poll from anywhere without carrying an id across navigation or reload. There is deliberately **no time-based cutoff** on the unacknowledged case — a completion stays visible until it has actually been seen, however long the client was away. Returns `startedAt` for the client to pass back to `/ack`. A stale pending job is lazily expired here so the UI it drives (e.g. a disabled Sync button) can recover without needing a fresh sync attempt.
- `POST /v1/me/gddl-sync/ack` — Marks a completed run as seen. **`GddlSyncJob.id` is stable per user forever** (the upsert never touches `id`), so client-side id-based dedup is broken by construction — acknowledgement is server-side and scoped to `{ id, userId, startedAt }`. Pinning `startedAt` is what prevents a delayed ack for an old run from matching a newer completed run on the same row and silently hiding it before the client ever saw it; a mismatch is a guaranteed no-op.
- `POST /v1/me/gddl-lists-sync` — Bidirectional sync of the FAVORITES and LEAST_FAVORITES collections with the corresponding GDDL user lists. Synchronous (lists are small); requires a KMS decrypt to read the stored key.
- `POST /v1/me/gddl-records/{levelId}` — Explicit, blocking GDDL record submission that surfaces errors to the user, as opposed to the fire-and-forget `submitToGddl` path inside `POST /v1/me/completions`.

## List Presets

```
GET    /v1/me/list-presets
POST   /v1/me/list-presets
PATCH  /v1/me/list-presets/{id}
DELETE /v1/me/list-presets/{id}
```

Saved filter/sort/column configurations for the List page.

## Import & Export

```
POST   /v1/me/import/check
POST   /v1/me/import/start
GET    /v1/me/import/status
PATCH  /v1/me/import/rows/{rowId}/resolve
POST   /v1/me/import/resolve-all
GET    /v1/me/export?section=&offset=&limit=
```

- `POST /v1/me/import/check` — Returns which of the given level IDs the user already has a completion for, with summary detail for the conflict UI. Read-only.
- `POST /v1/me/import/start` — Persists the whole validated dataset (rows plus the optional ranking / collections / ratings tabs) and asynchronously invokes the worker Lambda with just `{ jobId }`. The async Lambda invoke has a 256 KB payload cap, far too small for a full spreadsheet, so the dataset lives in Postgres rather than the invoke payload. Starting a new import discards the user's previous job entirely (cascading its rows) — **there is no import history.**
- `GET /v1/me/import/status` — The current job (or `null`) with live progress and the flagged rows the review UI surfaces. Polled by the toast, the Settings subline, and the Done screen; safe to call frequently.
- `PATCH /v1/me/import/rows/{rowId}/resolve` / `POST /v1/me/import/resolve-all` — Mark one or all flagged rows reviewed.
- `GET /v1/me/export` — **Not a file download.** Returns one `offset`/`limit`-paginated section of the account's data in a faithful domain form; the client fetches every section to completion and stitches the import-compatible spreadsheet itself. This keeps the round trip an identity (export → import reproduces the account) and keeps XLSX generation out of Lambda. See `IMPORT_EXPORT.md`.

---

# Planned Endpoints

None of the following are implemented. No handler, no `sst.config.ts` entry.

## Public Profiles & Cross-User Reads

```
GET  /v1/users/{usernameOrId}
GET  /v1/users/{usernameOrId}/progress
GET  /v1/users/{usernameOrId}/progress/{levelId}
GET  /v1/users/{usernameOrId}/collections
GET  /v1/users/{usernameOrId}/collections/{collectionId}
GET  /v1/users/{usernameOrId}/ranking/classic
```

Returns public profile data. `403` if private. Accepts both username and UUID — username is resolved to UUID server-side.

**These are reads only, and they are not aliases of the `/me` equivalents.** The split is deliberate and load-bearing:

| | `/v1/me/...` | `/v1/users/{usernameOrId}/...` |
| --- | --- | --- |
| Subject | JWT, authoritative | path parameter, resolved |
| Visibility | all entries, including `PRIVATE` | `profilePublic` + per-entry visibility enforced |
| Shape | full payload, client-side filtering | cursor-paginated, `?sort=`, `?order=`, filterable by list source / tier range / date range |
| Writes | yes | **no** |

Writes stay on `/me` permanently. The authenticated user comes from the JWT and never from a path segment, so a `PATCH /v1/users/{someoneElse}/...` route would exist only to be rejected.

> **Superseded design.** An earlier revision of this document specced collections writes at `/v1/users/{usernameOrId}/collections` ("writes require the path user to be the JWT user") and put ranking and export under `/v1/users/{usernameOrId}/` as well. That contradicted the JWT-authoritative rule stated for progress writes, and the implementation went the other way. `/me` for all writes is now the settled convention.

## Platformer Ranking

```
GET  /v1/me/ranking/platformer
POST /v1/me/ranking/platformer
...
```

Mirrors the classic ranking surface. Not implemented — only `ClassicRanking` exists in the schema.

## Cross-User Export

```
GET  /v1/users/{usernameOrId}/export
```

Deferred until public profiles land. Whether another user's data is exportable at all is an open privacy question, not a settled design.

## API Key Management (v3)

Introduced alongside the Geode mod. First-party only (Cognito JWT); not part of the third-party public surface.

```
GET    /v1/me/api-keys
POST   /v1/me/api-keys
DELETE /v1/me/api-keys/{keyId}
POST   /v1/me/api-keys/{keyId}/rotate
```

## OpenAPI Spec

**Planned, and not currently the source of truth.** No `openapi.yaml` exists in the repo, no `/docs` endpoint is served, and the frontend does not run `openapi-typescript`. Today the shared contract is `packages/core` — Zod schemas and types imported by both `apps/web` and `apps/api`.

The intent remains spec-first development with `openapi.yaml` as the contract and generated frontend types. Until that exists, **`packages/core` is where a new cross-the-wire shape belongs** — define it there rather than duplicating Zod schemas in each app. Note `apps/web` pins `zod@3` while `apps/api` and `packages/core` are on `zod@4`; be careful which schema utilities you reach for.

---

## Geode Mod Considerations

The Geode mod (future) would communicate with InfernoLog exclusively via this API using a user's API key. Its primary use cases map to endpoints that already exist:

- Auto-log a completion on level complete: `POST /v1/me/completions` (own account via JWT today; `progress:write` scope on the future API-key path)
- Read attempt count from the game natively (GD exposes this) and pass it in the request body

The API is designed with a native client in mind. No mod-specific endpoints are anticipated — the general surface covers all planned mod functionality.
