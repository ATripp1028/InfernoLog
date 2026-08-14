// The `test` every spec in this suite imports, instead of `@playwright/test`
// directly. It adds one thing: a data reset before any retry.
//
// Why that is needed. `globalSetup` resets once per run, which is enough for
// the first attempt at each spec — specs are written to be order-independent.
// A retry is different: the attempt that just failed was a *mutating* attempt,
// and it half-succeeded. Re-running it against the state it left behind does
// not re-test the same thing.
//
// Concretely, the failure that motivated this: a completion spec that failed
// after the write left the level logged. On retry the find step sinks
// already-logged levels below actionable ones and trims to a cap
// (lib/levelSearchResults.ts), so the row the spec clicks was no longer
// rendered — and the retry timed out waiting for an element instead of
// failing wherever the first attempt did. Retries have to fail for the same
// reason as the attempt they repeat, or they are noise.
//
// The cost — a reset round trip — is paid only when something has already
// gone wrong, so the passing path keeps the once-per-run behaviour.

import { test as base } from '@playwright/test'
import { readE2eEnv } from './env'
import { resetUserData } from './resetUserData'

export const test = base.extend<{ resetBetweenRetries: void }>({
  resetBetweenRetries: [
    // Playwright's fixture signature requires the dependency object even when
    // nothing is destructured out of it.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      if (testInfo.retry > 0) {
        const env = readE2eEnv()
        console.log(`[e2e] retry ${testInfo.retry} — resetting user data first`)
        await resetUserData(env.stage, env.email)
      }
      await use()
    },
    // `auto` so every spec gets it without opting in. A spec that forgets is
    // exactly the spec that will produce a confusing retry.
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
