import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const here = dirname(fileURLToPath(import.meta.url))

// Resolve @prisma/client directly to the app's generated client (which has the
// driverAdapters preview feature enabled). Without this, vite/vitest resolves
// to a client copy that rejects the `adapter` option used by getTestPrisma().
const prismaClientAlias = {
  '@prisma/client': resolve(here, 'node_modules/.prisma/client/default.js'),
}

// Two projects:
//  - unit: fast, mocks Prisma (e.g. me.test.ts). Default `*.test.ts`.
//  - integration: real Postgres round-trips (`*.integration.test.ts`). Runs
//    migrations once via globalSetup and executes single-fork to avoid
//    cross-file races on the shared database.
export default defineConfig({
  resolve: { alias: prismaClientAlias },
  test: {
    coverage: {
      provider: 'v8',
      // `all` counts files no test imports. Without it a module with zero tests
      // is simply absent from the report, which flatters the totals.
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/test/**', // test harness itself
        'src/scripts/**', // one-off backfills, run by hand
        'src/types/**', // type declarations, no runtime
        'src/index.ts', // Hono/Lambda entry wiring
        // Client/SDK construction with no branching worth asserting on. Any
        // test would only prove `new X()` was called.
        'src/sentry.ts',
        'src/utils/prisma.ts',
        'src/utils/logger.ts',
        'src/**/*.test.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // A regression guard, enforced in CI (the `Run API tests with coverage`
      // step in .github/workflows/ci.yml runs `test:coverage`, not `test`).
      // Deliberately NOT set to the current numbers. Actual
      // coverage sits a few points above this; the slack is there so nobody has
      // to test a defensive `if (!x) continue` just to keep the build green.
      // Raising it to match would buy nothing and cost exactly that.
      //
      // NOTE: these assume BOTH projects ran. `vitest --project unit
      // --coverage` alone reports far less and will trip them — that is the
      // integration suite's share, not a regression.
      thresholds: {
        statements: 94,
        branches: 88,
        functions: 95,
        lines: 95,
      },
    },
    projects: [
      {
        resolve: { alias: prismaClientAlias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        resolve: { alias: prismaClientAlias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.test.ts'],
          globalSetup: ['./src/test/globalSetup.ts'],
          // Run integration files sequentially to avoid cross-file races on the
          // shared test database.
          fileParallelism: false,
        },
      },
    ],
  },
})
