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

## Progress on a beaten level

**Decision:** a progress entry may never be dated **after** the level's
completion. Backfill — a session dated before it, or on the same day — is
always allowed.

**Why:** a completion records the run that beat the level, so nothing logged
after it can be progress toward beating it; a later entry either duplicates the
completion or is a lower number that means nothing. What a completed level CAN
hold is everything logged on the way there, which is why the rule is an
ordering rather than "a beaten level has no progress rows".

**One rule, one comparator.** `isDatedAfterCompletion`
(`services/progress/completionOrder.ts`) is the whole of it, and every path that
can put a progress entry on a completed level calls it:

| Path                             | Enforced in                    | On violation                       |
| -------------------------------- | ------------------------------ | ---------------------------------- |
| `POST /v1/me/progress`           | `applyProgress`                | 409 `ProgressAfterCompletionError` |
| `PATCH /v1/me/progress/:levelId` | `applyEdit` (PROGRESS targets) | 409 `ProgressAfterCompletionError` |
| Spreadsheet import, Progress tab | `planProgress`                 | Row skipped, reason reported       |

Both sides are yyyy-MM-dd calendar days, read back through their own timezone;
the raw instants are never compared. Undated on either side, or the same day,
is not a violation — see the comparator's own doc for why.

The completion is found by looking for a `kind = COMPLETION` update, not by
reading `status`, so a level dropped after being beaten is covered too.

**Not policed:** editing the _completion's_ date earlier, which can strand
existing sessions after it. No path can create that state, only an edit can
reach it, and refusing the edit would leave the user unable to correct a
mistyped completion date without deleting the sessions first.

The **delete** path still replays the old rule — a stray `PROGRESS` after a
`COMPLETION` must not un-complete a level — since legacy rows predating this
decision can still be in that shape.

**Both level pages drop the "Log progress" action once a level is beaten**
(`resolveLevelOwnership`, `useGlobalLevelDetailPage`), which is stricter than
the rule: it means in-app backfill has no entry point today, and backfilling a
beaten level's history is an import job. That is a UI decision, not the rule —
the endpoint accepts a backfilled session from any caller.

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
