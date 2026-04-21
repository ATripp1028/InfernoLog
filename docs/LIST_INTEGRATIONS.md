# InfernoLog — List Integrations

## Overview

InfernoLog supports multiple community difficulty lists as reference sources. Users are not locked into a single list — they can log tier/rank values from any supported list against any completion, and add references retroactively.

List tier/rank values are always **snapshots at time of logging**, reflecting historical context. They are never automatically updated after logging.

---

## Supported Lists (v1)

| List | Abbreviation | Type | API Available | Primary Use Case |
|---|---|---|---|---|
| GD Demon Ladder | GDDL | Tiered (numeric) | Yes | Most comprehensive — every demon in the game |
| Pointercrate Demonlist | Pointercrate | Ranked (numeric position) | Yes | Most reputable for extreme demons |
| All Rated Extreme Demons List | AREDL | Ranked (numeric position) | Investigate | Extreme demons |
| Non-Listworthy Spreadsheet | NLW | Tiered (named tiers) | Likely manual only | Demons below Pointercrate threshold |
| Pemonlist | Pemonlist | Ranked | Investigate | Platformer demons (v2) |

Additional lists may be added in future versions. The architecture uses a `ListProvider` interface so new sources are additive.

---

## List Reference Data Model

Each completion can have multiple list references. See `DATA_MODEL.md` — `list_references` table for schema details.

Key behaviors:
- A completion can have zero, one, or many list references
- References can be added retroactively after a completion is logged
- `at_time_of_completion` flag distinguishes snapshot values from retroactively added ones
- Deleting a completion deletes all its list references (no independent existence)

---

## Priority Chain (Auto-Placement)

When determining where a new completion falls in a user's personal ranking, list references are evaluated in this priority order:

1. GDDL tier
2. AREDL rank
3. Pointercrate rank
4. NLW tier
5. Other assigned references
6. No reference → unranked, placed at bottom

Users can reorder this priority chain in their settings. The default reflects GDDL's comprehensiveness.

**Cross-list conflict handling (v1):** When the new level's primary list source differs from surrounding levels' primary sources, auto-placement is limited to same-source levels and cross-list comparisons are flagged for manual resolution. A community conversion table between list scales is a v2 feature.

---

## GDDL Integration

**API:** Confirmed available. Requires user's personal GDDL API key for write operations.

### Autofill on Level ID Entry

When a user enters a level ID during logging, InfernoLog calls GDBrowser first for general metadata, then GDDL for tier-specific data. GDDL autofill populates:
- Current GDDL tier (presented to user as a suggested snapshot value to confirm)
- Record eligibility status

### Record Submission

If the user has provided their GDDL API key, they can submit a completion record to GDDL when logging a completion in InfernoLog. This is optional and user-initiated. The submission is made server-side via Lambda using the encrypted stored API key.

**GDDL API key storage:** Encrypted at rest with AWS KMS. Never returned to the frontend after initial entry. See `AUTH.md`.

### Tier as Manual Snapshot

The GDDL tier is entered/confirmed manually by the user rather than fetched automatically at logging time. This is intentional:
- GDDL placements update extremely frequently
- The snapshot reflects what the tier was when the player beat it, which is more historically meaningful
- Avoids excessive API load on GDDL's free platform

### GDDL Record Acceptance Indicator

Users can manually mark a completion as having an accepted GDDL record (`gddl_record_accepted = true`). This is not automatically synced from GDDL — it is a self-reported flag. This indicator is hidden for private profiles.

### Known Limitation: Record Deletion

GDDL records cannot be deleted via the API. If a user deletes a completion from InfernoLog, they are warned in the delete confirmation modal that the associated GDDL record must be managed directly on the GDDL platform.

---

## Pointercrate Integration

**API:** Public API available. Autofill of current rank is feasible. Record submission requires investigation.

Pointercrate is the most reputable list for extreme demons and is commonly used alongside GDDL for top-tier completions.

---

## AREDL Integration

**API:** Public API available. Integration feasibility to be confirmed.

---

## NLW Integration

**API:** Likely spreadsheet-based with no public API. Manual entry only for v1. A read-only scrape approach may be investigated for v2.

NLW covers demons below the Pointercrate threshold, making it relevant for players who complete demons that don't appear on more prestigious lists.

---

## ListProvider Interface

All list integrations are implemented behind a common `ListProvider` interface on the backend. This ensures new list sources can be added without touching existing integration code.

Minimum interface:

```typescript
interface ListProvider {
  id: ListSource;
  displayName: string;
  autofillByLevelId(levelId: string): Promise<ListAutofillResult | null>;
  submitRecord?(levelId: string, userCredential: string): Promise<ListSubmitResult>;
}
```

`submitRecord` is optional — lists without an API or write capability implement autofill only.

---

## Skill Tags

Skill tags describe what gameplay mechanics a level challenges (e.g. "wave", "straight fly", "memory", "timing").

```
Version timeline:
  v1:  No skill tags
  v3:  Tags sourced from GDDL/AREDL APIs — per-level, globally applied
  v4:  Independent voting system — community votes on level skillsets
```

### v3 Integration-Sourced Tags

Tags are pulled from GDDL and AREDL during autofill and stored on the `levels` table. They are:
- **Per-level (global)** — the same tags apply to a level for all users
- **Read-only** in v3 — users cannot add or modify tags, only consume them
- **Absent for unrated levels** — no tags until v4 voting covers them
- **Filterable** — users can filter their completion log and stats by skill tag
- **Functional in Level Picker** — skill tag questions become available in v3

### v4 Independent Voting

Community members vote on what skillsets a level challenges. Requires an established user base to produce meaningful results — deliberately held until v4. Non-completion entries are excluded from skill tag voting even in v4.

---

## Favorites and Least Favorites

GDDL exposes a favorites and least favorites feature via its API. InfernoLog mirrors this concept and extends it:

- Users have built-in `favorites` and `least_favorites` lists (special `type` values on `user_lists`)
- On initial GDDL connection, users can optionally **import** their existing GDDL favorites/least favorites
- When marking a level as a favorite in InfernoLog, users can optionally **sync** that to their GDDL account simultaneously
- Beyond these, users can create unlimited **custom named lists** (e.g. "Want to Beat", "Recommended to Friends")

See `DATA_MODEL.md` — `user_lists` and `level_list_entries` tables.
