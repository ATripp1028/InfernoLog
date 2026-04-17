# InfernoLog — Privacy Model

## Privacy Hierarchy

```
Profile visibility (global)
         │
         └── Per-entry visibility
                  │
                  ├── level_progress entries
                  │    └── (hides all associated progress_updates)
                  ├── Individual progress_updates
                  └── user_lists entries
```

A private profile forces all entries private regardless of per-entry settings. A public profile respects per-entry visibility settings.

---

## Profile Visibility

Single toggle: **public** or **private**. Default public.

| Setting | Effect |
|---|---|
| Public | Profile and all public-visibility entries visible to anyone |
| Private | All profile data inaccessible to anyone except the account owner |

### API Behavior for Private Profiles

Private profiles return **HTTP 403 Forbidden** on all API endpoints — not 404. This confirms the account exists while denying access, preventing the frustrating experience of not knowing if a username is taken vs. private. Unauthenticated visitors to a private profile on the frontend see a minimal confirmation page.

---

## Per-Entry Privacy

Every `level_progress` entry has its own `visibility` field (`public` or `private`), independent of the global profile toggle.

**Motivating example:** A well-known content creator verifies a level in mid-March but wants to hold the reveal until their video goes live in April. They set that specific `level_progress` entry to private. Their profile remains public, all other completions remain visible, but that specific level does not appear until they flip it to public.

This applies to:
- Completion entries
- In-progress entries (currently attempting)
- Dropped level entries

---

## Per-Field Visibility

Within a public profile, one field has independent visibility control:

| Field | Default | Toggleable |
|---|---|---|
| Discord account | Public | Yes — user can hide Discord independently |
| Google account | Not displayed publicly | N/A |
| All other profile fields | Public | Controlled by profile toggle only |

---

## Non-Completion Entry Visibility

Non-completion progress updates (entries where `is_completion = false`) are hidden throughout the app by default, controlled by the "show non-completions" toggle. This toggle is separate from privacy — it controls what the viewing user sees, not whether entries are public.

```
Per-entry privacy:  controls WHO can see the entry
Non-completion toggle: controls WHAT types of entries are shown
```

Both must pass for a non-completion entry to be visible:
1. Entry must be public (or viewer is the owner)
2. Viewer must have the non-completion toggle enabled

---

## GDDL Record Acceptance Indicator

The `record_acceptances` data is treated as profile content. It is hidden when the associated `level_progress` entry is private or when the profile is private.

---

## API Behavior Summary

| Scenario | Response |
|---|---|
| Public profile, public entry | 200 OK with data |
| Public profile, private entry | Entry excluded from results |
| Private profile, any request | 403 Forbidden |
| Authenticated owner requesting own private data | 200 OK with data |
| Moderator/admin via admin routes | 200 OK (not via public API) |

---

## Data Ownership

- Users own their own data
- Deleting a progress entry removes it and all associated data permanently
- Banning an account permanently deletes all user-generated content
- Suspending an account hides all content for the suspension duration without deleting it

---

## GDDL API Key

- Stored encrypted at rest (AWS KMS)
- Never returned to the frontend after initial submission
- Never logged or exposed in error messages
- Removable by the user at any time from settings

---

## Moderation Access

Moderators and admins can access private profiles and user data through internal admin routes for moderation purposes. This access is not available through the public API and is logged in `moderation_actions`.
