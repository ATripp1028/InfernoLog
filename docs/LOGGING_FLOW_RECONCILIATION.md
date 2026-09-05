# Logging Flow — Reconciliation Notes

`LOGGING_FLOW.md` is the authoritative spec for the logging flow. Where it
disagrees with older docs (e.g. `DEMON_LIST.md`, `LEVEL_LOGGING.md`,
`apps/api/prisma/schema.prisma`), this file records the resolved decision.

## Status transition: logging progress on a dropped level

**Decision:** logging a progress update against a level whose `level_progress`
is currently `dropped` **flips it back to `in_progress`**.

**Why:** the state machine permits `dropped → in_progress`, and logging fresh
progress implies the user has picked the level back up — active play. The UI
does not force an auto-flip, so this was an open choice; we flip for consistency
so a "dropped" level doesn't keep accumulating progress updates while still
displaying as dropped.

**Scope of the flip:**

- `dropped → in_progress` on any progress log. ✅
- A brand-new `level_progress` created by a progress log starts `in_progress`.
- `completed` never comes up — see below.

Implemented in `apps/api/src/services/progress/index.ts` (`applyProgress`).

## Logging progress on a beaten level

**Decision:** `POST /v1/me/progress` **refuses** a level the caller has already
completed, with a 409 (`LevelAlreadyCompletedError`).

**Why:** the completion row is the user's best run on that level, so a later
progress entry is either a duplicate of it or a lower number that means nothing.
Both level pages already drop the "Log progress" action once a level is beaten
(`resolveLevelOwnership`, `useGlobalLevelDetailPage`), and a frontend guard is
not an authorization decision — so the endpoint enforces the same rule.

Earlier the write was accepted and merely left `status = completed` untouched.
That is still the rule the **delete** path replays (a stray `PROGRESS` after a
`COMPLETION` must not un-complete a level), because the importer can still
produce that shape: it writes its progress rows directly and deliberately
accepts historical session data on a beaten level — see `IMPORT_EXPORT.md`.

Keyed on the existence of a `kind = COMPLETION` update, not on `status`, so a
level dropped after being beaten is refused too.

## Drop-from-scratch

Dropping a level the user has never logged before ("drop-from-scratch") is
allowed: the shared find-or-create may create a `level_progress` straight
into `status = dropped` with no prior `in_progress` row. (Documented directly
on the `LevelProgressStatus` enum in `schema.prisma` — this note just records
that it was a deliberate decision, not an oversight.)

## Per-action write routes

`API_DESIGN.md` originally specced a single `POST /v1/users/{usernameOrId}/progress`.
Replaced by per-action, me-scoped routes (`POST /v1/me/{completions,progress,drops}`)
because the three payloads differ structurally. See `API_DESIGN.md`.
