# InfernoLog — Moderation Policy (Internal)

This document is for the InfernoLog moderation team. It covers operational procedures, role definitions, and enforcement standards. For the public-facing content rules, see `COMMUNITY_POLICY.md`.

---

## Roles

| Role | Capabilities |
|---|---|
| `user` | Standard platform access |
| `moderator` | Access to moderation dashboard, reports queue, appeals queue. Cannot promote/demote other moderators |
| `admin` | All moderator capabilities + moderator promotion/demotion + verification management |

Role assignment is managed by the admin (platform owner) via the admin dashboard.

---

## Moderation Dashboard

Located at `/admin`. Gated behind `moderator` or `admin` role check server-side.

The dashboard contains two primary views:

**Reports Queue** — All pending user reports, sorted by submission date. Moderators see only reports where the reported user is not themselves (automatic exclusion). See Reports section below.

**Appeals Queue** — All pending ban appeals. See Appeals section below.

All moderation actions are logged in the `moderation_actions` table with the acting moderator's ID, timestamp, and reason.

---

## Reports

### Submission

Any active user can submit a report against another user. Reports are submitted through an in-app form (not email). Rate limiting is enforced to prevent spam — specific limits TBD.

### Queue Assignment

Reports are automatically excluded from the dashboard view of any moderator who is the reported user. This prevents conflicts of interest without requiring manual routing.

### Actions Available Per Report

- **Dismiss** — No action taken. Report is closed
- **Warn** — User receives a formal warning (visible to mod team, not publicly displayed)
- **Suspend** — Account suspended for a specified duration. Content is hidden during suspension
- **Ban** — Account permanently banned. Content is deleted. User may submit one appeal

Each action requires a reason to be entered, which is stored in `moderation_actions`.

### Consequences for Malicious Reports

- Reports submitted for clearly invalid reasons → reporter account suspended
- Reports used to attack the mod team → reporter account banned

These consequences are communicated in the report submission UI and in `COMMUNITY_POLICY.md`.

---

## Appeals

Users may submit **one appeal per ban** through the appeals portal. The form accepts freeform text making their case.

Appeals appear in the Appeals Queue in the moderation dashboard. Any moderator (excluding one with a conflict of interest) may review an appeal and mark it approved or denied.

Approved appeals result in account reinstatement. Denied appeals are final — no further appeals are accepted.

---

## Moderator Conduct

Moderators are held to the same content standards as regular users under `COMMUNITY_POLICY.md`. Violations of these standards result in immediate removal of moderator privileges by the admin, regardless of seniority.

### Reports Against Moderators

If a report is filed against a moderator:
1. The report is automatically excluded from that moderator's queue
2. Another moderator handles the report using standard procedures
3. That moderator may escalate to the full mod team for a vote on banning

### Team Votes

For escalated cases involving moderator conduct, a majority vote among available moderators determines the outcome. The admin may break ties.

### Admin Accountability

As platform owner, the admin cannot be banned from their own platform. However, the admin is expected to uphold the same conduct standards and is responsible for their own behavior on the platform.

---

## Verification

Verification (`is_verified = true`) is a badge indicating a notable community member.

**Granting:** Admin only. Candidate criteria may include YouTube subscriber count, Pointercrate stats viewer profile status, or other community standing indicators. Specific thresholds are TBD (v2/v3 feature).

**Revoking:** Admin only, at their discretion. Verification may be revoked if a verified user is found to have engaged in behavior that would result in a ban for a regular user, or for conduct that would reflect poorly on the platform.

Verification revocation does not automatically result in a ban — it is an independent action.

---

## Content on Banned/Suspended Accounts

| Status | Content Visibility | Data Retention |
|---|---|---|
| Suspended | Hidden for suspension duration | Retained, restored on unsuspend |
| Banned | Immediately hidden | Permanently deleted |

Banned users' usernames are retained and cannot be claimed by others.

---

## Audit Log

All moderation actions are stored permanently in `moderation_actions`. This log is accessible to moderators and admins within the dashboard for accountability and consistency review.
