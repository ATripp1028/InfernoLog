# InfernoLog — Authentication & Authorization

## Auth Provider

**AWS Cognito** handles all authentication, through one user pool with two ways in:

- **Email and password** — a native Cognito user per account. The browser signs in with SRP (`AuthContext.signInWithPassword`), so the password itself never crosses the wire.
- **Google** — Cognito's hosted UI federating with Google.

Every request carries a Cognito ID token, which API Gateway's JWT authorizer verifies before the Lambda runs; `apps/api/src/middleware/auth.ts` reads the claims it already verified. The API holds a plaintext password only inside the four routes that must (see [Where the API handles passwords](#where-the-api-handles-passwords)), and never stores one — Cognito does.

---

## Registration & Linking

1. Everyone passes the COPPA age gate first (`/age-gate`), then chooses a method on `/signup`
2. **Email and password:** `POST /v1/auth/password-signup/start` emails a code, `…/verify` checks it and creates the Cognito user; the browser then signs in and calls `POST /v1/auth/signup/start`
3. **Google:** the hosted UI's callback calls `POST /v1/auth/signup/start` directly
4. Either way that route creates the `users` row together with its first identity, and everyone then picks a username in the onboarding wizard
5. Afterwards, Settings can add the other sign-in method, remove one, and link a Discord account

### Accounts and identities

An account (`users` row) is who someone is; an identity (`auth_identities` row) is an external account connected to it, and an account can have several. An identity is attached only by a flow that already knows which account it acts for (signup, or linking under that account's own session), never by matching an email address.

| Provider   | How it is connected                                              | Can sign in | Key                                   |
| ---------- | ---------------------------------------------------------------- | ----------- | ------------------------------------- |
| `GOOGLE`   | Sign up, or Settings with a Google proof, via Cognito federation | Yes         | Cognito sub                           |
| `PASSWORD` | Sign up with a verified email, or Settings with a Google proof   | Yes         | Cognito sub                           |
| `DISCORD`  | Linked from Settings, via Discord OAuth                          | Not yet     | Discord user id (`providerAccountId`) |

Each Cognito-backed identity is its own Cognito user, so deleting an account deletes every one of them. An account holds at most one Discord identity and at most one Google identity; one Discord account can be linked to only one InfernoLog account.

**Two invariants hold across every path** (both swept by `apps/api/src/services/invariants.integration.test.ts`):

- An account always keeps at least one identity it can sign in with. `DELETE /v1/me/identities/:id` refuses the last one, checked under a row lock on the account so two concurrent removals cannot each pass.
- A `PASSWORD` identity's email is the account's email. Signup, adding a password, and changing the email all write both together.

### Sign up vs. Sign in — two entry points

The landing page (`/`) exposes **Sign up** and **Sign in** as two distinct entry points:

- **Sign up** → COPPA age gate (`/age-gate`) → `/signup` → onboarding
- **Sign in** → `/signin` → straight to the user's List

This split is a **COPPA compliance requirement, not a UX preference.** Nothing about a would-be user may be collected before the age check: Cognito creates a federated identity on the Google callback regardless of path, and the email-and-password form asks for an address. So the gate runs first, and `/signup` refuses to render without the flag it sets (`lib/ageGate.ts`, sessionStorage). Existing users signing in skip it entirely. For Google, the clicked intent is recorded client-side (`AUTH_INTENT_KEY` in `AuthContext`) so the OAuth callback can branch: `signup` creates the user row; `signin` rejects and discards the Cognito identity if no account exists. The age gate itself never sends anything to the server — see `apps/web/src/features/onboarding/AgeGate.tsx`.

### Email addresses

An account's email is what it signs in with and how a forgotten password is recovered, and it is **never shown to other users** — no public read includes it, and until onboarding is finished an account appears in no public read at all (`publicUserWhere` in `services/user/publicUser.ts`). Every stored email is lowercase, enforced by CHECK constraints on `users` and `auth_identities` (migration `lowercase_emails`), so normalize with core's `EmailSchema` before writing.

A connected Google account's email is recorded on its identity as a record of what Google asserted. It is never the account's email, and it may coincide with another account's without consequence.

**No response ever reveals which addresses have accounts.** The pool sets `preventUserExistenceErrors`, so Cognito answers the same way either way; signup and change-email answer "check your inbox" whatever the address is; and an address that already belongs to an account receives an explanatory email instead of a code, so only its owner learns anything.

### Verification codes

The API issues, emails and checks its own six-digit codes (`services/verification`, `EmailVerification`), for three things: a new account's address (`SIGNUP`), an address being added while adding a password (`PASSWORD_SETUP`), and a new account email (`EMAIL_CHANGE`).

It does this rather than use Cognito's attribute verification because Cognito can only send such a code to a user who already exists and is signed in — which would mean an unverified, password-holding Cognito user existing before the address was proven — and cannot send the other emails these flows need.

- Only an HMAC of a code is stored, keyed by `VERIFICATION_CODE_SECRET` and bound to the purpose and address, so a code for one is never valid for another.
- A code lasts 15 minutes, survives 5 wrong guesses, works once, and is replaced by any newer code for the same purpose and address.
- Rate limits: 3 codes per address per hour and 10 per source IP per hour, counted from the rows themselves, which is why a row is written even when the email sent is a notice rather than a code. IPs are stored only as an HMAC.
- Rows are deleted 24 hours after creation by the `PurgeEmailVerifications` cron, which also bounds how long a hashed IP is kept.

**Forgot password is the exception**: it is Cognito's own `ForgotPassword`/`ConfirmForgotPassword` flow, run from the browser, because it acts on a Cognito user that already exists and needs no session. The API is not involved. The pool's verification message template holds that email's wording. After a reset the browser signs in once and signs out globally, so every other session's refresh token is revoked.

### Google proof — re-confirming in Settings

Adding a password, connecting Google, and changing the email of an account without a password each need proof that the person is in control of a Google account **right now**, on top of the session.

The browser gets it by running its own PKCE authorization-code flow against the hosted UI (`identity_provider=Google`), returning to `/auth/google-proof` — a path Amplify does not watch — and exchanging the code itself (`apps/web/src/lib/googleProof.ts`). Amplify refuses `signInWithRedirect` while a session exists, and signing out first would swap the account's session for the Google one, so the request that uses the proof would no longer carry the account's JWT. This way the account's session is untouched, and the refresh token from the exchange is revoked immediately.

The proof is the resulting Cognito ID token. `apps/api/src/utils/googleProof.ts` verifies it with `aws-jwt-verify` — signature, audience, `token_use`, a Google entry in `identities`, and `auth_time` within 5 minutes — and every caller additionally checks it names one of **that account's own** Google identities. A live Google session means Google may re-confirm without asking for anything; that is accepted as sufficient. Between its callback and the form that uses it, the proof waits in sessionStorage for at most 4.5 minutes and is removed once used.

### Where the API handles passwords

Four routes hold a plaintext password, each for one Cognito call, wrapped in `Sensitive` the whole way (see CLAUDE.md "Credential handling"):

| Route                                  | What it does with it                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `POST /v1/auth/password-signup/verify` | `AdminCreateUser` + `AdminSetUserPassword` after the code checks out      |
| `POST /v1/me/password/setup`           | The same, for an account adding a password                                |
| `PUT /v1/me/password`                  | `AdminInitiateAuth` to check the current one, then `AdminSetUserPassword` |
| `POST /v1/me/email/start`              | `AdminInitiateAuth` to check the current one                              |

Checking a current password uses `InfernoLogServerClient`, a Cognito app client with only `ADMIN_USER_PASSWORD_AUTH`, which requires AWS credentials to call and is not in the API Gateway authorizer's audience. The web client gets `ALLOW_USER_SRP_AUTH` and never a plaintext-password flow. Cognito's own per-user lockout is what rate-limits guessing a current password.

### Password policy

`PasswordSchema` in `@infernolog/core` is the single definition the API validates with and the web checklist renders from: 8–256 characters, with a lowercase letter, an uppercase letter, a digit, and a symbol from Cognito's own list, and no leading or trailing space. The pool's `passwordPolicy` in `infra/auth.ts` mirrors it — change both together, or users see a satisfied checklist and a rejection from Cognito.

### Changing the account email

`POST /v1/me/email/start` proves who is asking (the current password, or a Google proof for an account without one) and emails a code to the new address; `POST /v1/me/email/verify` checks it and makes the change. When the account has a password, that sign-in's Cognito user moves to the new address first — taking over an orphaned native user that holds it, refusing one an account signs in with — and moves back if the account update fails, so the sign-in email and the account email never disagree. The old address is always notified.

---

## API Keys (Third-Party Access) _(v3)_

API keys are not built in v1 or v2. They are introduced in v3 to coincide with the Geode mod launch. The `ApiKey` model already exists in `schema.prisma` for reference (a migration ran ahead of the feature), but no route or service code reads or writes it — it should stay unused until v3.

API keys allow third-party tools (e.g. the Geode mod, community tools) to perform operations on behalf of a user.

### Rules

- Maximum **5 API keys** per user
- Keys do not expire but can be **revoked or rotated** at any time from the settings page
- Each key has a **name** (e.g. "Geode Mod", "Community Dashboard") and a set of **scopes**
- Keys are shown to the user only once at creation. Only a hash is stored server-side
- All API key operations go through Lambda — keys are never exposed to the frontend after creation

### Scopes

| Scope               | Permission                       |
| ------------------- | -------------------------------- |
| `completions:read`  | Read user's completions          |
| `completions:write` | Create and update completions    |
| `drops:read`        | Read user's dropped levels       |
| `drops:write`       | Create and update dropped levels |
| `lists:read`        | Read user's custom lists         |
| `lists:write`       | Create and update custom lists   |
| `profile:read`      | Read user's profile data         |

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

| Role        | Capabilities                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `user`      | Standard access to own data and public profiles                                    |
| `moderator` | Access to moderation dashboard, reports queue, appeals queue                       |
| `admin`     | All moderator capabilities + verification management, moderator promotion/demotion |

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
