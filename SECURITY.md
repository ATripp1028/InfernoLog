# Security Posture

This file documents decisions and practices InfernoLog has adopted specifically concerning security.

## Vulnerabilities

InfernoLog aims to protect its users' data to the best of its ability. However, I recognize that I may unintentionally introduce security vulnerabilities in updates.

If you find any vulnerabilities in my code, whether by searching the code or some other method, please notify me at contact@infernolog.com. Do not disclose this publicly, whether it be on Twitter, Discord, GitHub, or an other platform until I have informed you that the vulnerability has been patched. This is to ensure that your good-faith reporting doesn't get the attention of malicious actors, who may abuse your finding to harm others. I will aim to respond to your concern within 48 hours of your email.

In your report, please disclose the following to the best of your ability:

1. (Optional) If you found the issue in the code, what file(s) and lines(s) it can be found on.
2. A general description of the issue.
3. Workflow for reproducing it.
4. (Optional) If, during your investigation, you furnish a solution to the bug, state the solution.

Because PRs are publicly available, I ask that you don't make PRs for serious security issues, as I can't guarantee that I will have time to review the PR before the vulnerability is exploited.

### Credential handling

**Passwords and verification codes are credentials, and they never reach a log line, a Sentry event, an error message, a response body, or storage.** Since password sign-in, the API handles both in plaintext: it creates Cognito users with `AdminSetUserPassword`, checks a current password with `AdminInitiateAuth`, and issues and checks emailed codes itself (`services/verification`). The rules, and what enforces each:

- **Name them so tooling can see them.** A variable or field holding a credential is named with `password` or `verificationCode`, never a bare `code`, which already means error codes and level codes here. `eslint.credentials.mjs`, shared by both apps, fails lint when a `logger.*`, `console.*`, or `Sentry.*` call, or a `new …Error(…)`, contains anything with such a name or a `.reveal()` call. `src/test/credentialLint.test.ts` proves the rule still fires. Never `eslint-disable` it: rename the harmless `hasPassword` flag instead.
- **In the API, wrap on arrival.** Turn a credential into a `Sensitive` (`utils/sensitive.ts`) as soon as its body is parsed. It prints `[REDACTED]` through `String`, `JSON.stringify`, `inspect`, and Pino. `.reveal()` is only for the call that genuinely needs the plaintext: the Cognito SDK or the HMAC.
- **Never persist.** Codes are stored only as an HMAC keyed by `VERIFICATION_CODE_SECRET` (`EmailVerification.codeHash`), and requesters' IPs only as an HMAC too. In the browser, a credential lives in flow state and is never written to localStorage, sessionStorage, or the persisted query cache. The one token that does touch storage is a Google proof, which sits in sessionStorage for under 5 minutes between its callback and the password form, and is removed once used (`lib/googleProof.ts`).
- **Every route that receives a credential gets a leak test.** Use `src/test/captureLeaks.ts`: send `leakSentinel()` values down the success path, every expected failure, and a forced 500, then call `leakCapture.expectNoLeak(...)`, which checks every Pino line and the raw arguments of every Sentry call. `middleware/errors.leak.test.ts` is the model.
- **Safety nets, not permission.** Pino's `redact` (built from core's `SENSITIVE_FIELD_NAMES`) and Sentry's `beforeSend`/`beforeBreadcrumb` (core's `scrubErrorEvent`, wired in both apps) strip credential fields that slip through. The web Sentry spec also pins `sendDefaultPii: false` and no Session Replay. Workers under `handlers/` initialize Sentry through the Lambda auto-import and get neither scrubber, so a worker that ever touches a credential must be given one first.
- **Committed secrets fail CI.** The `secrets` job in `ci.yml` runs gitleaks over full history with `.gitleaks.toml`: the default rules plus custom rules for hardcoded credential-named assignments, which the defaults miss. GitHub secret scanning and push protection are on as well. Test fixtures use `leakSentinel()` or the `Leak-Canary-` prefix, the one allowlisted pattern. Never allowlist a real value: remove it, rotate it, and purge it from history.