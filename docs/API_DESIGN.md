# InfernoLog — Public API Design

## Overview

InfernoLog exposes a public REST API for community developers and first-party integrations (including the planned Geode mod). The API is versioned, rate-limited, and documented via an OpenAPI spec hosted in the `infernolog-app` repo.

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
```
Returns cached level metadata. Sourced from the InfernoLog levels cache (populated by GDBrowser autofill). Does not call GDBrowser live.

---

### Users

```
GET  /v1/users/{usernameOrId}
```
Returns public profile data. 403 if private. Accepts both username and UUID — username is resolved to UUID server-side.

---

### Completions

```
GET    /v1/users/{usernameOrId}/completions
GET    /v1/users/{usernameOrId}/completions/{levelId}
POST   /v1/users/{usernameOrId}/completions
PATCH  /v1/users/{usernameOrId}/completions/{levelId}
DELETE /v1/users/{usernameOrId}/completions/{levelId}
```

- `GET` (list): Paginated. Sortable by any logged metric via `?sort=` and `?order=` params. Filterable by list source, tier range, date range.
- `POST` / `PATCH` / `DELETE`: Require `completions:write` scope (API key) or Cognito JWT for own account.
- Write operations on another user's account are forbidden regardless of scope.

---

### Dropped Levels

```
GET    /v1/users/{usernameOrId}/dropped
GET    /v1/users/{usernameOrId}/dropped/{levelId}
POST   /v1/users/{usernameOrId}/dropped
PATCH  /v1/users/{usernameOrId}/dropped/{levelId}
DELETE /v1/users/{usernameOrId}/dropped/{levelId}
```

Same auth and privacy rules as completions.

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

The OpenAPI spec (`openapi.yaml`) lives in the `infernolog-app` repo and is the source of truth for the API contract. The frontend uses `openapi-typescript` to auto-generate TypeScript types from this spec. The backend implements against it.

Any API change requires updating the spec first, then implementing. This enforces spec-first development.

---

## Geode Mod Considerations

The Geode mod (future) communicates with InfernoLog exclusively via this public API using a user's API key. The mod's primary use cases map to existing endpoints:

- Auto-log a completion on level complete: `POST /v1/users/{usernameOrId}/completions` with `completions:write` scope
- Read attempt count from the game natively (GD exposes this), pass in request body
- Prompt drop logging: `POST /v1/users/{usernameOrId}/dropped` with `drops:write` scope

The API is designed with a native client in mind. No mod-specific endpoints are needed — the general API surface covers all planned mod functionality.
