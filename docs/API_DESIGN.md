# InfernoLog — API Design

## Overview

InfernoLog's backend is a Hono app on AWS Lambda behind an API Gateway v2 HTTP API. It serves the first-party frontend only.

**This document describes what is implemented and deployed**, as of 2026-10-07. Nothing here is aspirational: an endpoint that has no handler is not in this document. Ideas for the API that haven't been built live in `ROADMAP.md`.

> **Route registration:** adding an endpoint requires **two** changes — a Hono route in `apps/api/src/routes/<domain>/*.ts` **and** a matching `api.route(...)` (or `authedRoute(...)`) entry in one of the `apps/api/infra/routes/*.ts` modules. API Gateway 404s before Hono sees the request otherwise. `infra/routes/` (plus `GET /health` in `infra/api.ts`) is the exhaustive list of the live surface; `sst.config.ts` only imports those modules.
>
> Each route module is a directory: an `index.ts` that lists its routes, mounts the sub-files, and owns the module's one `onError` (which maps that domain's service error classes to statuses), beside thin handler files. Hono matches by **registration order**, not static-over-param, so literal segments must be mounted before a `/:param` sibling.

---

## Versioning

All application routes are prefixed with `/v1/`. There is no other version.

Two routes sit outside the version prefix by design: `GET /health` and `GET /auth/discord/callback` (the OAuth redirect target, whose URL is registered with Discord and should not carry a version that could change).

---

## Authentication

A Cognito JWT is the only way to authenticate. (`schema.prisma` has an `ApiKey` model, but nothing reads or writes it.)

Every per-user route lives under `/v1/me/`, and the subject always comes from the token — never from a path segment or a payload. There are no routes that take another user's id.

The first-party frontend passes a Cognito ID token as `Authorization: Bearer <token>`, from either sign-in method (email and password over SRP, or Google). API Gateway's JWT authorizer verifies it before the Lambda runs — signature, issuer, and audience; the authorizer's audience list in `infra/api.ts` is the **only** audience gate. `apps/api/src/middleware/auth.ts` reads those verified claims, resolves the token's `sub` through `auth_identities` to the account, and sets `userId` (internal UUID) and `userEmail` (always the account's address, never the token's) on the Hono context. Handlers must use `c.get('userId')` — never the Cognito sub directly.

The middleware's own refusals, which any authenticated route can return:

- `401` — no token, or one the gateway rejects (the gateway answers; Hono never runs)
- `404 { error: 'User not found' }` — a valid Cognito identity with no InfernoLog account. The frontend's sign-in flow keys off this on `GET /v1/me`.
- `403 { reason: 'banned' }` / `403 { reason: 'suspended', until? }` — the account's moderation state. The gate lives in the middleware so no route can forget it; a suspension whose end date has passed is treated as served.

The middleware is mounted on `/v1/*`, so **every `/v1` route is authenticated** unless it is registered before the middleware in `src/index.ts`. Today that carve-out is exactly three groups:

- `GET /v1/users/check-username` — `routes/users/`, mounted on `/v1` ahead of the middleware
- `POST /v1/auth/signup/start` and `POST /v1/auth/signin/reject` — "claims-only" routes that verify the Cognito token but tolerate a missing `User` row, since they run before one exists
- `POST /v1/auth/password-signup/start` and `…/verify` — fully public: an email-and-password signup has no token until the address is verified and the Cognito user exists

Note this means the `/v1/levels/*` endpoints are **authenticated**, even though the level cache is shared data. That is load-bearing, not incidental: `/resolve` returns the caller's `existingCompletion`, `/page` returns the caller's `userProgressStatus` / `userHasCompletion`, and all three RobTop-reaching routes charge a per-user budget (see Rate Limiting).

CORS allows `https://infernolog.com` in production (`http://localhost:5173` on other stages) and the `Content-Type` and `Authorization` headers only.

---

## Rate Limiting

There is no general per-user or per-IP quota. What is enforced:

- **Gateway throttle** — every route is capped at 50 requests/second (burst 100) by the stage's default route settings in `infra/api.ts`. This is a per-route ceiling across **all** callers, not a per-user quota: it bounds the blast radius of one client looping an endpoint rather than attributing it.
- **Per-user RobTop budget** — `utils/robtopUserBudget.ts`. 200 tokens per user, refilling over an hour, charged only when a request is genuinely about to call the GD servers: a cache miss on `GET /v1/levels/{levelId}/resolve` or `/page`, and every `GET /v1/levels/gd-search`. Cache hits are free, so ordinary use never touches it. Exhausted → `429 { reason: 'rate_limited', retryable: true, retryAfterSeconds }` with a `Retry-After` header.
- **Verification codes** — 3 per address per hour and 10 per source IP per hour, counted from `email_verifications` rows and enforced in `services/verification`; over the limit is `429 RATE_LIMITED`. A code lives 15 minutes and allows 5 attempts in total: 4 wrong guesses leave it usable, the 5th kills it.
- **Current-password checks** — Cognito's own per-user lockout, which `PUT /v1/me/password` and `POST /v1/me/email/start` surface as `429 TOO_MANY_ATTEMPTS`.

Two more limiters are unrelated to inbound traffic — they pace InfernoLog's **outbound** calls, with the bucket held in Postgres because Lambda invocations share no memory:

- `utils/robtopRateLimit.ts` — the GD servers, shared by the `resolve`, `page`, and `gd-search` routes **and** the background workers (level seed, level sync, GDDL sync). A request can wait for a slot, which is why the RobTop-reaching routes get a 25-second timeout.
- `utils/gddlRateLimit.ts` — GDDL's public level lookup (100 requests/minute per IP). Unlike the RobTop limiter it never waits: a denied call is read as "GDDL had no opinion this pass".

---

## Response Shape

There is no generated contract (see Shared Contract), so these are conventions rather than guarantees — check the handler.

- **Success** — most endpoints wrap the payload as `{ data: ... }`. Creates return `201`, async job starts `202`, and the two deletes with nothing to say (`DELETE /v1/me/collections/{collectionId}`, `DELETE /v1/me/log-presets/{id}`) `204`.
- **Not wrapped in `data`** — `GET /v1/users/check-username`, `GET /v1/levels/{levelId}/resolve`, `GET /v1/levels/gd-search`, `GET /v1/me/export` (`{ items, hasMore }`), `POST /v1/me/import/check`, `POST /v1/me/import/start` (`{ jobId }`), and `DELETE /v1/me/progress/{levelId}` (`{ gddlCaveat }`). The keyset lists return `{ data, nextCursor }` (see Pagination).
- **Errors** — always `{ error }`, usually a human-readable string. A machine-readable discriminator rides alongside where the client branches on it, and its key differs by domain: `code` on the auth and credential routes (`AuthErrorCode` in `@infernolog/core`), `reason` on the levels and Discord routes, and on collections the code **is** `error` with the prose in `message`.
- **Validation** — a body that fails its Zod schema is `400` with `error` set to Zod's flattened issues (an object, not a string). Routes whose body carries a secret — passwords, verification codes, the GDDL key — substitute a fixed message so a validation error can never echo it back.
- **Unhandled** — `500 { error: 'Internal server error' }`, logged and reported to Sentry by the module's `onError`.

---

## Privacy

Every endpoint is own-account only, scoped by JWT. No endpoint returns another user's data, so nothing in the API enforces visibility.

The visibility settings are stored and editable all the same: `User.profilePublic`, `User.discordPublic` (both on `PATCH /v1/me`), and a per-entry `visibility` on each logged update (see `schema.prisma` and `PRIVACY.md`). Reads ignore all of them — `GET /v1/me/progress` returns `PRIVATE` entries because you are looking at your own data. `activity_log.visibility` is likewise inert.

One guard exists ahead of any reader: `services/user/publicUser.ts` exports `publicUserWhere` / `publicUsers()`, the filter a read of other users must merge into its `where`. It hides accounts that haven't completed onboarding, whose username is still a placeholder built from the email's local part. Nothing calls it yet.

---

## Pagination

Cursor-based (keyset) pagination is the standard for list endpoints. Offset pagination is avoided where ordering shifts frequently.

```json
{ "data": [...], "nextCursor": "opaque_cursor_string" }
```

`nextCursor` is `null` on the last page — there is no separate `hasMore`. The client passes it back as `?cursor=`. Pages are a fixed 30 rows; there is no `limit` parameter. A malformed cursor is treated as no cursor (first page) rather than an error.

This is **not** universal, and the exceptions are intentional:

| Endpoint                                       | Scheme                     | Why                                                                                                                                       |
| ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/levels/browse`                        | cursor (keyset)            | The standard. Stable ordering over a large cache.                                                                                         |
| `GET /v1/me/collections/{collectionId}/levels` | cursor (keyset)            | The same browse, scoped to one collection.                                                                                                |
| `GET /v1/me/activity`                          | cursor (keyset)            | The merged event/progress feed, newest first.                                                                                             |
| `GET /v1/me/export`                            | `offset` + `limit`         | Section-by-section full drain; the client stitches the file. Stable snapshot, order-insensitive. Returns `{ items, hasMore }`.            |
| `GET /v1/me/progress`                          | **none** — full payload    | The List page wants every row in hand for client-side filtering and a live match counter. Hundreds to low thousands of rows for one user. |
| `GET /v1/me/demon-list/classic`                | **none** — full payload    | Returns placed and unplaced columns together; the demon list UI is a drag-and-drop board over the whole set.                              |
| `GET /v1/levels/search`                        | **none** — `LIMIT 20`      | Typeahead.                                                                                                                                |
| `GET /v1/levels/gd-search`                     | **none** — first page only | One upstream GD query; never paginated (see below).                                                                                       |

---

# Endpoints

The 72 routes deployed, grouped by feature.

## Health

```
GET  /health                                    (no auth)
```

Returns `{ status: 'ok', app: 'InfernoLog' }`.

---

## Auth & Onboarding

```
GET   /auth/discord/callback                    (no auth — signed state instead)
POST  /v1/auth/password-signup/start            (no auth)
POST  /v1/auth/password-signup/verify           (no auth)
POST  /v1/auth/signup/start                     (claims-only)
POST  /v1/auth/signin/reject                    (claims-only)
POST  /v1/me/connect-discord
POST  /v1/me/connect-discord/complete
DELETE /v1/me/connect-discord
```

- `POST /v1/auth/password-signup/start` — Emails a six-digit code to the address, or, when it already belongs to an account, a notice saying so. Always `202` with the same body either way, so the form never reveals which addresses are registered. Rate-limited per address and per hashed source IP.
- `POST /v1/auth/password-signup/verify` — Checks the code and creates the native Cognito user, already confirmed and verified (`201`). The browser then signs in with it and calls `signup/start` like a Google signup, so the `users` row is still created in exactly one place. `400 INVALID_CODE` for a wrong, expired, used, or over-guessed code; `409 ACCOUNT_EXISTS` when the address gained an account meanwhile.
- `POST /v1/auth/signup/start` — Creates the InfernoLog `users` row for a confirmed, age-gated sign-up, from either sign-in method. Refuses a token whose `email_verified` is not true (`403 EMAIL_NOT_VERIFIED`), and reads the provider from the token's `identities` claim rather than being told. Idempotent: a double-submit for the same Cognito identity returns the already-created row rather than erroring, which also covers an identity that already has an InfernoLog account going through Sign Up by mistake. A **different** identity arriving with an email another account already has gets `409 ACCOUNT_EXISTS`, and its Cognito user is discarded like a rejected sign-in's. Returns `onboardingCompleted` so the frontend knows whether to route into the wizard or straight into the app.
- `POST /v1/auth/signin/reject` — Called when a Sign In attempt finds no matching InfernoLog user for the just-completed Google OAuth identity. Synchronously deletes the Cognito user so no trace of the attempt persists. Load-bearing for the COPPA argument that a rejected sign-in never retains a would-be user's data — neither this handler nor the app-wide request logger logs the claims payload, only the `sub`.
- `POST /v1/me/connect-discord` — Returns a Discord OAuth URL carrying a signed state that encodes the signed-in user's id. The browser navigates there; Discord redirects to the public callback.
- `POST /v1/me/connect-discord/complete` — Exchanges the code for the Discord account and writes the identity. The only write in the flow, and the only place the state's claimed user id is checked against the authenticated caller. Refusals carry a `reason`: `400 invalid_state` (malformed, mis-signed, or older than 10 minutes), `403 state_mismatch` (the state names a different account — the code is never spent), `502 exchange_failed` (Discord refused the code or was unreachable), `409 already_linked_elsewhere`. An account holds at most one Discord link; linking replaces the previous one.
- `DELETE /v1/me/connect-discord` — Unlinks. Discord is a connection, not a sign-in method, so it is not removed through `DELETE /v1/me/identities/{id}`.
- `GET /auth/discord/callback` — Public because Discord sends the browser there. A bouncer: it redirects to the frontend's `/auth/discord/complete` with `code` and `state` (or to `/settings?discord=error&reason=…` on a declined or malformed redirect) and decides nothing. The signed state is what proves which signed-in user initiated the flow, and it is validated on `/complete`, before the Discord identity is written.

> **Note:** the `users` row is created **only** by `POST /v1/auth/signup/start`, which calls `createUserForSignup` to seed the default rating category and the built-in collections. Nothing else creates one, or attaches a sign-in identity to an existing one by matching email — a sign-in by an unrecognized identity depends on nothing having been created for it.

## Users

```
GET  /v1/users/check-username?username=         (no auth)
```

Availability check for the debounced sign-up and settings typeahead. Returns `{ available: boolean, error?: string }`.

Validates against `UsernameSchema` in `@infernolog/core` — length (2–32), character set (`[A-Za-z0-9_-]`), and reserved names (`admin`, `moderator`, `infernolog`) — before the uniqueness query, so the verdict here matches what `PATCH /v1/me/username` would return on submit. Invalid input short-circuits without touching the database.

Always responds `200`, including for a missing or malformed `username`. The endpoint answers "can I have this name?", and "no, because it's too short" is an answer rather than a client error; `error` carries the reason for inline display beneath the field.

Lives in `src/routes/users/`, mounted before `authMiddleware`. It is the only route in that module.

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

Route order matters: `/search`, `/browse`, and `/gd-search` are declared before `/{levelId}` so Hono does not capture the literal segment as an id (`routes/levels/routing.test.ts` pins this).

A level id is the in-game id — a numeric string, and the cache's primary key. Every `{levelId}` route here answers `400` to a non-numeric one. The three routes that can reach the GD servers (`/resolve`, `/page`, `/gd-search`) charge the caller's RobTop budget when they actually call out, and answer `429 { reason: 'rate_limited' }` when it is spent (see Rate Limiting).

- `GET /v1/levels/{levelId}` — Cached level metadata from the InfernoLog levels cache. Does **not** call the GD servers. 404 if not cached.
- `GET /v1/levels/{levelId}/resolve` — The autofill endpoint that fires on level-ID entry in the logging modal. Cache hit returns the cached level; cache miss calls the GD servers once and writes the result into the cache (`data_source = robtop_autofill`, `verified = true`, including the `is_demon` flag). If the GD servers are unavailable or return nothing, responds `200` with `{ level: null, fallbackToManual: true }` — never a `500` (GD-server unavailability is an expected branch, not an error). Also returns `suggestedGddlTier` (the level's cached community GDDL tier for rated levels, to pre-fill the user's own tier — `null` when unknown; it is read from the cache row, and the best-effort community refresh that fills it never blocks or fails the resolve) and `existingCompletion` (the authed user's existing completion, or `null`) so the client can pre-populate the edit form ("edit, not replace").
- `GET /v1/levels/{levelId}/page` — The Global Level Page's data source. Unlike the bare cached-only `GET` above, a cache miss here resolves from the GD servers (autofill + Song File Hub lookup) and caches it. Alongside the level it returns the caller's `userProgressStatus` (or `null`) and `userHasCompletion` — status and beaten-or-not only, no progress values. The failure modes are kept distinct so the page can branch: `404 { reason: 'not_found' }` (GD has no such level — terminal, nothing cached, so a later visit re-resolves), `503 { reason: 'unreachable' }` (GD couldn't be reached — retryable), and `422 { reason: 'not_a_demon' }` (GD rates it a non-demon, which the cache never admits — terminal, nothing cached; the body carries the level's name, creator and difficulty so the client can say which level it was). `GET /v1/levels/{levelId}/resolve` refuses the same levels the same way.
- `GET /v1/levels/search?q=` — Fuzzy/typo-tolerant level **name** search over the cache via a `pg_trgm` GIN index (not the GD servers' live search). Two complementary index-supported matchers: `ILIKE '%q%'` so short fragments like "Cat" surface "Cataclysm" (the `%` similarity operator alone needs ~4 characters of a long name to clear pg_trgm's 0.3 threshold), and `name % q` for typo tolerance ("Cataclism"). Ordered by similarity, `LIMIT 20`. Empty array on a cold cache. `400` when `q` is missing or longer than 200 characters (`MAX_SEARCH_QUERY_LENGTH`).
- `GET /v1/levels/browse` — The `/search` page's cursor-paginated, filtered cache search. Filters, sort, and cursor come from the query string (arrays as repeated params); delegates to `services/levels/browse.ts`. Every quantitative field in `LEVEL_RANGE_FIELDS` (`packages/core`) takes an inclusive `<field>Min` / `<field>Max` pair, validated against `LEVEL_RANGE_BOUNDS`; a bound excludes levels whose value is unknown, and an AREDL rank bound matches main-list placements only (a Legacy position is a list index, not a rank). The sheet tier is the exact single-tier `sheetTier` filter rather than a range — its tiers are named categories. Unknown values sort last in both directions. Each row also carries the community-list, duration, object-count, game-version, rated-date and song-type figures, so the page can show whatever it is sorted or filtered by. Range bounds and every sort but downloads/likes are cache-only — `/gd-search` ignores them.
- `GET /v1/levels/gd-search` — The opt-in GD-server search escalation. One `getGJLevels21` query (**first page only — never cursor-paginated**), cache dedupe, rated/unrated partition, and automatic seeding of rated survivors (`services/levels/gdSearch.ts`). Fired only on explicit user confirmation from a cache-search UI, never on keystroke. **Always scoped to GD's Demon bucket** (`diff=-2`, plus `demonFilter` when exactly one tier is selected), since the cache admits no rated non-demon — so an unrated level whose voted face isn't a demon one cannot be found this way and has to be added by its ID. The `/search` page's filters and sort are forwarded where GD's schema permits, so an empty query is valid as long as there is a forwardable filter or a downloads/likes sort to browse by (`400` otherwise). Takes the same query string as `/browse`; a creator search-by has no GD equivalent, so its term is dropped and the request degrades to a filter browse. The body is a status union — `ok` (with `rated` / `unrated` rows), `nothing_new`, or `503 { status: 'unreachable', retryable: true }` so a failed GD call is distinguishable from an empty result. Shares the outbound RobTop rate limiter, hence the extended Lambda timeout in `infra/routes/levels.ts`.
- `POST /v1/levels` — Manual metadata write (the autofill-fallback form submit). Creates the level with `data_source = manual`, `verified = false`. The user-entered difficulty **becomes** the level's `in_game_difficulty` (the one sanctioned exception to in-game-difficulty-is-read-only). It must be one of the five demon tiers or `Unrated` — the only levels the cache admits (`services/levels/admission.ts`) — and `is_demon`/`is_rated` are derived from it rather than sent. `400` for anything else, `409` if the level already exists.

## Progress

**Reads:**

```
GET  /v1/me/progress
GET  /v1/me/progress/{levelId}
```

- `GET /v1/me/progress` — Backs the List page. Returns the authenticated user's **entire** level-progress list in one payload (both `PUBLIC` and `PRIVATE` entries), shaped per `LevelProgressListItemSchema` in `@infernolog/core`. Each row carries the trimmed level metadata (including the level's community GDDL / AREDL / sheet tiers), the **representative** progress update as `entry` (the completion if the level has one, otherwise the most recent), the level-scoped `userGddlTier`, `difficultyOpinion` and `ratingScores`, a query-time-computed `overallRating` (the weighted average of `ratingScores` and enjoyment — see `RATING_SYSTEM.md`), and a derived `needsPlacement` flag (a completed classic level with no `ClassicDemonList` row). **No query params:** all filtering, multi-key sorting, and column selection happen client-side.
- `GET /v1/me/progress/{levelId}` — The Level Page payload: `level_progress` fields (including the level-scoped `ratingScores`, `difficultyOpinion`, `userGddlTier`, `coinsCollected`), level metadata, **all** progress updates newest-first, the demon-list placement (`listIndex` plus a derived 1-based `rankPosition`, both `null` when unplaced), the completion's `completionVideoUrl` / `completionHighlightUrl`, and the computed `runsGraph` array (`utils/runsGraph.ts`). `404` when the user has no entry for the level. The Level Page timeline shows complete history without the "show non-completions" toggle — that toggle governs the List and the demon list only.

> Ratings, difficulty opinion, and the user's GDDL tier are **one current value per level** (`LevelProgress`), not per logged event — only `enjoyment` is per-event. The old `ListReference` / `ListSource` tables are gone: community tiers are now level-global columns on `Level`, and the user's own opinion is the single `userGddlTier`.

**Writes** — per-action and me-scoped. The authenticated user always comes from the Cognito JWT, never from the path or payload:

```
POST   /v1/me/completions
POST   /v1/me/progress
POST   /v1/me/drops
PATCH  /v1/me/progress/{levelId}
DELETE /v1/me/progress/{levelId}
DELETE /v1/me/progress/{levelId}/updates/{progressUpdateId}
```

There are three per-action creates rather than one generic one because the payloads differ structurally. All three resolve-or-create the same underlying `level_progress` row for the user+level, then apply the action. **The level must already be in the cache** — a write against an uncached level is `400`, so the client resolves it (`/resolve`) or creates it (`POST /v1/levels`) first.

- `POST /v1/me/completions` — Creates **or edits** the user's completion. Idempotent: if a completion already exists for the level it is **updated in place** (edit-not-replace), never duplicated — exactly one `kind = completion` per `level_progress`. 100% is implied (no percentage / run-range). `in_game_difficulty` is snapshotted from the cached level, never accepted from the client. Carries the session details (date + timezone + uncertain flag, attempts, fps, percentage version, device, on-stream, highlight URL, notes, per-entry `visibility`), `videoUrl`, `enjoyment`, `worstFail` (+ its date), and the level-scoped fields: `difficultyOpinion`, per-category `ratingScores` (replaced wholesale on an edit; `400` if one names a category the caller doesn't own), `userGddlTier`, `coinsCollected`, and the 2-player fields. Beating a level removes it from Want to Beat in the same transaction. **It does not submit anything to GDDL** — that is the explicit `POST /v1/me/gddl-records/{levelId}` below.
- `POST /v1/me/progress` — Creates a non-completion progress update (`kind = progress`). Discriminated on `mode`: `from_zero` (single best `percentage`, greater than 0 and at most 100 — 0% is not a run) or `from_run` (`runFrom` / `runTo` segment, 0–100, `runTo > runFrom`). Logging progress on a **dropped** level flips it back to `in_progress` (see `LOGGING_FLOW_RECONCILIATION.md`). `409` when the update would be dated after the level's completion; a session dated before it, on the same day, or undated is backfill and is accepted.
- `POST /v1/me/drops` — Creates a `kind = drop` progress update with optional `date`, `attempts`, `notes`, `worstFail`, and per-entry `visibility`, and sets `level_progress.status = dropped`. Drop-from-scratch is allowed (a level the user has never logged), and a level can be dropped more than once — each drop is its own row.
- `PATCH /v1/me/progress/{levelId}` — Edits one progress update and/or the `LevelProgress` metadata. All fields optional; only present keys are written. The update edited is the one named by an optional `progressUpdateId`, otherwise the most recent — the completion if one exists, then by `loggedAt` desc, matching the Level Page's display order. Percentage / run-range fields are refused (`400`) on an update that isn't `kind = progress`, as are completion-only fields on one that isn't a completion.
- `DELETE /v1/me/progress/{levelId}` — Deletes the whole entry: every progress update, its rating scores, and the `ClassicDemonList` row, per the schema's `onDelete: Cascade` relations — plus the `activity_log` rows scoped to that level, which do not cascade and are purged explicitly in the same transaction. **GDDL caveat:** GDDL records cannot be deleted through the GDDL API; users must remove them on the GDDL platform directly. This is stated in the response body (`{ gddlCaveat }`) so the frontend can surface it in the delete confirmation.
- `DELETE /v1/me/progress/{levelId}/updates/{progressUpdateId}` — Removes a single logged entry rather than the whole level, and re-derives the level's status from what remains. Deleting the last remaining update deletes the entire `level_progress` instead; the response's `deletedLevelProgress` says which happened.

Each create returns `201` with the full resulting record (`{ levelProgress, progressUpdate }`) so the client can update the UI without a follow-up `GET`.

## Collections (Want to Beat, Favorites, Least Favorites, Custom)

```
GET    /v1/me/collections
POST   /v1/me/collections
GET    /v1/me/collections/{collectionId}
PATCH  /v1/me/collections/{collectionId}
DELETE /v1/me/collections/{collectionId}
PUT    /v1/me/collections/{collectionId}/ordering
GET    /v1/me/collections/{collectionId}/levels
POST   /v1/me/collections/{collectionId}/entries
POST   /v1/me/collections/{collectionId}/entries/copy
PATCH  /v1/me/collections/{collectionId}/entries/{entryId}
DELETE /v1/me/collections/{collectionId}/entries/{entryId}
```

Own-account only. Rule violations return a machine-readable code as `error` (prose in `message`): `DUPLICATE_NAME` (409), `RESERVED_NAME` (422), `BUILT_IN_COLLECTION` (403 — edit or delete of a built-in), `ORDERING_FIXED` (403), `LEVEL_ALREADY_COMPLETED` (409 — adding a completed level to Want to Beat), `SELF_REFERENTIAL_NEIGHBOR` (422), `SAME_COLLECTION` (422). A collection or entry that isn't the caller's is `404`; adding a level that isn't in the cache yet is `400`. Adding an already-present level is an idempotent no-op. Entry reorder sends the two neighbour entry ids (`prevId` / `nextId`); the server computes the fractional midpoint and renormalises when the gap underflows (`utils/fractionalIndex.ts`).

- `PUT …/ordering` — Switches a collection between `ORDERED` and `UNORDERED`. Its own route rather than a `PATCH` field because the rule differs from a rename (built-in Want to Beat may convert; Favorites and Least Favorites are always ordered — `ORDERING_FIXED`) and because going `UNORDERED` discards the curated order.
- `GET …/levels` — The `/search` page's browse scoped to one collection: the same query string, sorts, filters, and `{ data, nextCursor }` paging as `GET /v1/levels/browse`, with each row also carrying its entry id.
- `POST …/entries/copy` — Adds every level of `sourceCollectionId` that the target lacks, appended in the source's display order. The source is unchanged. Want to Beat's rule applies, except that a beaten level is skipped and counted rather than failing the copy; the response reports how many were added, already present, and skipped.

Want to Beat holds only unbeaten levels — every completion write path (the completions endpoint, the spreadsheet import, the GDDL sync) calls `removeFromWantToBeat` inside its transaction.

> "List" is overloaded in conversation. **Collections** (`Collection` / `CollectionEntry`) are user-owned groupings of levels; the **demon list** (`ClassicDemonList`) is the user's personal difficulty ranking; the **community lists** (GDDL / AREDL / the NLW sheet) are tier columns on `Level`. Unrelated concepts.

## Rankings

```
GET    /v1/me/demon-list/classic
POST   /v1/me/demon-list/classic
PATCH  /v1/me/demon-list/classic/{levelProgressId}
DELETE /v1/me/demon-list/classic/{levelProgressId}
```

- `GET` — Returns both the placed and unplaced columns in one payload. No pagination, no query params.
- `POST` — Place an unplaced completion.
- `PATCH` — Reorder a placed entry.
- `DELETE` — Unplace, returning it to the panel.

The path parameter is the `levelProgressId` (the entry's UUID), not the level id. Order is a fractional index (`ClassicDemonList.listIndex`): lower is easier, so the displayed list is `listIndex` descending with #1 the hardest. A missing completion or placement is `404`; a caller-fixable rule violation (already placed, bad neighbours) is `400`.

All ordering and fractional-indexing logic lives in `services/demonList/`; the handlers only parse, dispatch, and map service errors to status codes. Every placement change is recorded in the activity log, which is what `rank-history` (below) reads. Classic levels only — `ClassicDemonList` is the one ranking model in the schema.

## Activity

```
GET  /v1/me/activity
GET  /v1/me/levels/{levelId}/rank-history
```

The read side of the event log (see `EVENT_LOG.md`). Nothing here writes — events are emitted by `services/activityLog` from inside the transaction of each mutation they describe. Both are own-account only with no cross-user equivalent: `activity_log.visibility` is inert.

- `GET /v1/me/activity` — The Log page's merged feed: `activity_log` events and progress updates interleaved, newest first by recorded time, keyset-paginated (`{ data, nextCursor }`, 30 per page). Optional filters: `kind` and `category` (repeated params, like `/browse`'s arrays — `category` only narrows the edits group), `levelId`, `from` / `to` (on recorded time), and `cursor`. `levelId` is a union over the event's own level and its impact rows, so a bulk import that moved a level still appears in that level's history.
- `GET /v1/me/levels/{levelId}/rank-history` — One level's position history in the caller's classic demon list, as `{ data, currentPosition }`. Only direct moves are stored; shifts caused by other levels being placed around it are reconstructed by replaying the user's demon-list events (`services/activityLog/rankHistory.ts`).

## Rating Configuration

```
GET  /v1/me/rating-categories
PUT  /v1/me/rating-config
```

`PUT /v1/me/rating-config` atomically replaces the user's rating configuration in a single transaction. Granular per-category endpoints were deliberately removed: the sum-must-equal-target invariant makes single-row mutations impossible to validate in isolation — you cannot change one weight without changing another. The editor submits the full config — the categories in display order plus `includeEnjoyment`, `enjoymentWeight`, and `enjoymentSortOrder`; the server diffs it against existing rows and applies create/update/delete in one transaction. It rejects an empty category list and any config whose active weights miss 1.00 (`400`), a category id that isn't the caller's (`404` — the whole request, rather than silently dropping it), and duplicate category names (`409`).

Deleting a category deletes its rating scores and, in the same transaction, purges it from the user's saved List presets, whose view-config blobs reference categories by id with no foreign key. A save that changed something emits one `RATING_CONFIG_CHANGE` activity event. Returns the same payload as `GET /v1/me`.

Ratings are stored as integers 0–100 internally and category weights as a fraction of 1.00; conversion happens at the display layer, which shows scores on 0–10, enjoyment on 0–100, and weights as whole percents. See `docs/RATING_SYSTEM.md`.

## Account & Settings

```
GET    /v1/me
PATCH  /v1/me
PATCH  /v1/me/username
DELETE /v1/me
PUT    /v1/me/password
POST   /v1/me/password/setup/start
POST   /v1/me/password/setup
POST   /v1/me/email/start
POST   /v1/me/email/verify
POST   /v1/me/identities/google
DELETE /v1/me/identities/{id}
```

- `GET /v1/me` — The authenticated user plus rating categories and `identities` (the account's sign-in methods and Discord link, oldest first). `gddlApiKeyEncrypted` is destructured out server-side and replaced by a derived `hasGddlApiKey` boolean; the ciphertext never reaches a client. `verifiedAt` is likewise reduced to `isVerified`. Every account route that returns "the user" (`PATCH /v1/me`, `…/username`, `…/rating-config`, `…/gddl-key`) returns this same shape through the one serializer, `services/user/serialize.ts`.
- `PATCH /v1/me` — Partial update of user preferences (privacy, logging defaults, display options), validated by `UpdateMeSchema`; an empty body is `400`. Three accepted keys are not plain columns: `acceptLegal: true` stamps `legalAcceptedAt`, `youtubeEmbedConsent` stamps or clears `youtubeEmbedConsentAt`, and `onboardingCompleted` is how the wizard finishes. Rating configuration belongs on `PUT /v1/me/rating-config` — but note `UpdateMeSchema` still accepts `includeEnjoyment` and `enjoymentWeight`, which this route writes without the weights-sum-to-1.00 check or the activity event.
- `PATCH /v1/me/username` — Separate from `PATCH /v1/me` because it carries a 30-day cooldown (`403 { error: 'cooldown', nextAllowedAt }`) and a case-insensitive uniqueness check (`409`).
- `PUT /v1/me/password` — Changes the password. Checks the current one through the server-only app client (`400 CURRENT_PASSWORD_INCORRECT`, or `429 TOO_MANY_ATTEMPTS` once Cognito's lockout engages), then optionally revokes every session that signed in with it (`signOutOthers`). `409 NO_PASSWORD` for an account that has none.
- `POST /v1/me/password/setup/start` and `POST /v1/me/password/setup` — Add a password to an account that has none (`409 PASSWORD_EXISTS` otherwise). Both require a fresh Google proof (docs/AUTH.md); a missing or stale one is `403 REAUTH_REQUIRED`. `start` answers `{ codeRequired }` — false for the account's own address, true otherwise, with a code emailed to it. The address chosen becomes the account email.
- `POST /v1/me/email/start` and `POST /v1/me/email/verify` — Change the account email: the current password (or a Google proof for an account without one), then a code at the new address. Moves the `PASSWORD` identity's Cognito user with it, and notifies the old address. `400 SAME_EMAIL` for the current address. As at signup, an address that already has an account is sent a notice instead of a code, so `start` never reveals it; only `verify` — which proves ownership of the address — answers `409 ACCOUNT_EXISTS`.
- `POST /v1/me/identities/google` — Connects a Google account, identified by a Google proof rather than by email. `409` when it is already connected here (`ALREADY_CONNECTED`), belongs to another account (`CONNECTED_ELSEWHERE`), or the account already has a Google sign-in.
- `DELETE /v1/me/identities/{id}` — Removes a sign-in method, refusing the last one (`409 LAST_SIGN_IN_METHOD`). Deletes its Cognito user, and reports `signedOut: true` when it was the method the caller signed in with. Discord is unlinked through `DELETE /v1/me/connect-discord` instead (`400` here).
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

Every route that needs the key answers `400` when none is stored. KMS encrypt/decrypt permission is granted per route in `infra/routes/gddl.ts`, not to the API as a whole.

- `PUT /v1/me/gddl-key` — Stores or replaces the user's GDDL API key. Encrypted with AWS KMS before it touches the database and **never logged**. The key is verified against GDDL before being stored (`400` if GDDL rejects it), and the GDDL username it belongs to is saved alongside — `409` when that GDDL account is already connected to a different InfernoLog user. Returns the `GET /v1/me` payload (so only the derived `hasGddlApiKey` flag, never the key) plus `gddlName`.
- `DELETE /v1/me/gddl-key` — Removes the stored key and the linked GDDL username.
- `POST /v1/me/gddl-sync` — Creates an async sync job and returns `202` + `jobId` immediately; the work runs in the `GddlSyncWorker` Lambda so API Gateway's 29-second integration timeout never applies regardless of how many GDDL pages / RobTop lookups are needed. Only one job may be active per user: if one is pending, this returns its id rather than starting a second. Idempotent under double-clicks and multiple tabs. A pending job older than 20 minutes is treated as failed ("Sync timed out"), so a dead worker cannot block syncing forever.
- `GET /v1/me/gddl-sync` — The current or most-recent job while it is still relevant: pending, or completed/failed but not yet acknowledged. No job id needed, so the frontend can poll from anywhere without carrying an id across navigation or reload. There is deliberately **no time-based cutoff** on the unacknowledged case — a completion stays visible until it has actually been seen, however long the client was away. Returns `startedAt` for the client to pass back to `/ack`. A stale pending job is lazily expired here so the UI it drives (e.g. a disabled Sync button) can recover without needing a fresh sync attempt.
- `POST /v1/me/gddl-sync/ack` — Marks a completed run as seen. **`GddlSyncJob.id` is stable per user forever** (the upsert never touches `id`), so client-side id-based dedup is broken by construction — acknowledgement is server-side and scoped to `{ id, userId, startedAt }` (the body is `{ jobId, startedAt }`). Pinning `startedAt` is what prevents a delayed ack for an old run from matching a newer completed run on the same row and silently hiding it before the client ever saw it; a mismatch is a guaranteed no-op, and the route answers `200` either way.
- `POST /v1/me/gddl-lists-sync` — Bidirectional sync of the FAVORITES and LEAST_FAVORITES collections with the corresponding GDDL user lists. Synchronous (lists are small); requires a KMS decrypt to read the stored key. `502` when GDDL itself refuses or is unreachable.
- `POST /v1/me/gddl-records/{levelId}` — Submits the caller's existing completion of a level to GDDL as a record. Explicit and blocking, so GDDL's verdict reaches the user: `404` when there is no completion to submit, `422` with GDDL's message when it rejects the record (bad video link, duplicate). **This is the only path that submits a record** — logging a completion does not.

## List Presets

```
GET    /v1/me/log-presets
POST   /v1/me/log-presets
PATCH  /v1/me/log-presets/{id}
DELETE /v1/me/log-presets/{id}
```

Saved view configurations for the List page: a name, description and colour plus `sorts`, `filters`, `columns`, `columnOrder`, and the `hideTime` toggle. The four view-config fields are opaque JSON — stored and returned verbatim, not deeply validated. A preset id that belongs to someone else is `404`, not `403`, so it is indistinguishable from a nonexistent one.

## Import & Export

```
POST   /v1/me/import/check
POST   /v1/me/import/start
GET    /v1/me/import/status
PATCH  /v1/me/import/rows/{rowId}/resolve
POST   /v1/me/import/resolve-all
GET    /v1/me/export?section=&offset=&limit=
```

- `POST /v1/me/import/check` — The pre-flight conflict check: which of the given level IDs the user already has a completion for, plus the equivalent checks for the ratings, collections, and ranking tabs, with summary detail for the conflict UI. Writes nothing to the account, but is no longer a single query — it can fall back to the GD servers to resolve collection entries by name, hence its 28-second timeout.
- `POST /v1/me/import/start` — Persists the whole validated dataset (rows plus the optional ranking / collections / ratings tabs) and asynchronously invokes the worker Lambda with just `{ jobId }`. The async Lambda invoke has a 256 KB payload cap, far too small for a full spreadsheet, so the dataset lives in Postgres rather than the invoke payload. Starting a new import discards the user's previous job entirely (cascading its rows) — **there is no import history.**
- `GET /v1/me/import/status` — The current job (or `null`) with live progress and the flagged rows the review UI surfaces. Polled by the toast, the Settings subline, and the Done screen; safe to call frequently.
- `PATCH /v1/me/import/rows/{rowId}/resolve` / `POST /v1/me/import/resolve-all` — Mark one or all flagged rows reviewed.
- `GET /v1/me/export` — **Not a file download.** Returns one `offset`/`limit`-paginated section of the account's data in a faithful domain form, as `{ items, hasMore }`. `section` is required and one of `completions`, `progress`, `dropped`, `ranking`, `ratings`, `collections`, `categories` (`EXPORT_SECTIONS` in `@infernolog/core`; `400` otherwise); `limit` defaults to 500 and is clamped to 1000. The client fetches every section to completion and stitches the import-compatible spreadsheet itself. This keeps the round trip an identity (export → import reproduces the account) and keeps XLSX generation out of Lambda. See `IMPORT_EXPORT.md`.

---

# Shared Contract

The contract between the frontend and the API is `packages/core` — Zod schemas and types imported by both `apps/web` and `apps/api`. There is no OpenAPI spec, no `/docs` endpoint, and no generated client.

**`packages/core` is where a new cross-the-wire shape belongs** — define it there rather than duplicating Zod schemas in each app. Note the version boundary is api↔core, not web↔api: `packages/core` pins `zod@3` while `apps/api` is on `zod@4`, and `apps/web` declares no zod of its own. Parse with a core schema, never compose one into a locally-declared Zod 4 schema — see `CODE_QUALITY.md` Backend §3.
