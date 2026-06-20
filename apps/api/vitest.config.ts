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
