import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, readE2eEnv } from './env'
import { STORAGE_STATE_PATH } from './globalSetup'

// Playwright config for the E2E suite. It is never run directly: `pnpm
// test:e2e` goes through e2e/run.ts, which resolves the stage's API URL and
// Cognito client from SSM and puts them in the environment this reads.
//
// These specs live outside `src/` on purpose. vitest.config.ts globs
// `src/**/tests/*.spec.{ts,tsx}`, so the two runners cannot pick up each
// other's files — a Playwright spec run by vitest fails in a confusing way.

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')

const env = readE2eEnv()

export default defineConfig({
  testDir: here,
  testMatch: '**/*.e2e.ts',
  outputDir: resolve(webRoot, 'test-results'),

  // The suite drives one shared user against one shared staging database, so
  // specs cannot safely interleave even though each is written to be
  // order-independent. The suite is small by design; serial is cheap here and
  // removes a whole class of "passes alone, fails together".
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  // A shared environment fails for reasons that are not code defects
  // ("staging is down", a cold Lambda past the assertion timeout). Retries
  // absorb that; the trace on the first retry is what makes a CI-only failure
  // diagnosable at all.
  retries: 2,
  // Real network, real Lambda cold starts.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: resolve(webRoot, 'playwright-report'), open: 'never' },
    ],
  ],

  globalSetup: resolve(here, 'globalSetup.ts'),

  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // The frontend is served locally rather than hit at its deployed URL: the
  // non-production API's CORS allowlist is exactly `http://localhost:5173`
  // (infra/api.ts), as are the Cognito callback URLs. The build is the real
  // production build of this commit, pointed at the real staging API — which
  // is what the suite exists to check.
  webServer: {
    command: 'pnpm build:e2e && pnpm preview:e2e',
    cwd: webRoot,
    url: BASE_URL,
    // A production build from cold is not fast.
    timeout: 180_000,
    // Deliberately never reuse, not even locally — the usual
    // `!process.env.CI` idiom is wrong here. This server is not
    // interchangeable with whatever else might hold :5173: it is built with
    // VITE_COGNITO_CLIENT_ID pointing at the E2E app client, and the injected
    // session's localStorage keys are derived from that id. A `pnpm dev`
    // server on the same port is built from .env.local with the *web* client,
    // so Amplify finds no session and every spec fails on the landing page —
    // silently, and with nothing in the failure to suggest why. Refusing to
    // reuse turns that into an immediate "port in use" from Playwright.
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_API_URL: env.apiUrl,
      VITE_COGNITO_USER_POOL_ID: env.userPoolId,
      // The E2E app client, NOT the web client the deployed site is built
      // with. Amplify derives its localStorage keys from whatever client id it
      // is configured with, and refreshes tokens through it — so the client
      // that minted the session in globalSetup has to be the one the app is
      // configured with, or the app finds no session and refresh 401s.
      VITE_COGNITO_CLIENT_ID: env.clientId,
      VITE_COGNITO_DOMAIN: env.cognitoDomain,
      // Never used — the suite arrives with a session already — but Amplify's
      // OAuth config requires them to be present and non-empty.
      VITE_REDIRECT_SIGN_IN: `${BASE_URL}/auth/callback`,
      VITE_REDIRECT_SIGN_OUT: BASE_URL,
    },
  },
})
