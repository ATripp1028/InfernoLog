# Logging Flow — Reconciliation Notes

`LOGGING_FLOW.md` is the authoritative spec for the logging flow. Where it
disagrees with older docs (e.g. `RANKING_SYSTEM.md`, `LEVEL_LOGGING.md`,
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
- `completed` is left untouched — logging extra progress on a beaten level does
  not un-complete it.
- A brand-new `level_progress` created by a progress log starts `in_progress`.

Implemented in `apps/api/src/services/progress.ts` (`applyProgress`).

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
