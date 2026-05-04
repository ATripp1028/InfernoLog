# InfernoLog — Authentication & Authorization

## Auth Provider

**AWS Cognito** handles all authentication. Google and Discord are configured as federated identity providers. Users can link both to a single InfernoLog account after initial registration.

All auth flows go through Cognito. The backend validates Cognito-issued JWTs on every request. The frontend never handles passwords or OAuth tokens directly.

---

## Registration & Linking

1. User signs in with Google or Discord via Cognito hosted UI
2. On first sign-in, a User record is created in the InfernoLog database
3. After account creation, users can link the other provider (Google or Discord) from their settings page under a "Connected Accounts" panel
4. Discord visibility is independently togglable (public by default)

---

## API Keys (Third-Party Access) *(v3)*

API keys are not built in v1 or v2. They are introduced in v3 to coincide with the Geode mod launch. The `api_keys` table schema is defined in `DATA_MODEL.md` for reference but should not be implemented until v3.

API keys allow third-party tools (e.g. the Geode mod, community tools) to perform operations on behalf of a user.

### Rules
- Maximum **5 API keys** per user
- Keys do not expire but can be **revoked or rotated** at any time from the settings page
- Each key has a **name** (e.g. "Geode Mod", "Community Dashboard") and a set of **scopes**
- Keys are shown to the user only once at creation. Only a hash is stored server-side
- All API key operations go through Lambda — keys are never exposed to the frontend after creation

### Scopes

| Scope | Permission |
|---|---|
| `completions:read` | Read user's completions |
| `completions:write` | Create and update completions |
| `drops:read` | Read user's dropped levels |
| `drops:write` | Create and update dropped levels |
| `lists:read` | Read user's custom lists |
| `lists:write` | Create and update custom lists |
| `profile:read` | Read user's profile data |

### Key Lifecycle

- **Revoke:** Immediately invalidates the key. A new key must be created to restore access
- **Rotate:** Invalidates the old key and issues a new one atomically. Useful when a key is accidentally exposed
- **Rate limiting:** API Gateway enforces per-key rate limits to protect backend and database from abuse

---

## Username Rules

- Usernames must be unique
- Users may change their username with a **30-day cooldown** between changes
- The **old username is held** for the full 30-day cooldown period and cannot be claimed by anyone else, preventing impersonation of recently-renamed accounts
- Public API routes accept both `username` and `UUID`. Username resolves to UUID server-side. The UUID is the canonical stable identifier

---

## Roles & Permissions

| Role | Capabilities |
|---|---|
| `user` | Standard access to own data and public profiles |
| `moderator` | Access to moderation dashboard, reports queue, appeals queue |
| `admin` | All moderator capabilities + verification management, moderator promotion/demotion |

Role is stored on the `users` table and checked server-side on all privileged routes. The `/admin` route on the frontend is gated behind a role check.

---

## GDDL API Key Storage

Users may optionally provide their personal GDDL API key to enable record submission. This key:

- Is stored **encrypted at rest** in the database using AWS KMS
- Is **never returned to the frontend** after initial submission
- Is used exclusively by Lambda functions when making GDDL API calls on behalf of the user
- Can be removed by the user at any time from the Connected Accounts settings panel

---

## Privacy Model

See `PRIVACY.md` for full details. Auth-relevant summary:

- Profile visibility (public/private) is a user setting, default public
- Private profiles return **HTTP 403 Forbidden** on all API requests, including from authenticated users who are not the profile owner
- Discord account visibility is independently togglable, default public
