// Vitest globalSetup for the integration project. Owns the full lifecycle of
// the local test database (docker-compose.test.yml):
//   - before the suite: start the container (waiting for healthy) + apply migrations
//   - after the suite:  stop and remove the container
//
// Returning the teardown function is vitest's contract — it runs once after all
// integration tests complete.

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { TEST_DATABASE_URL } from './utils'

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const COMPOSE = 'docker compose -f docker-compose.test.yml'

export default function setup() {
  // Start the test database and wait until it reports healthy.
  execSync(`${COMPOSE} up -d --wait`, { cwd: apiRoot, stdio: 'inherit' })

  // migrate deploy is idempotent — already-applied migrations are skipped.
  // Both URLs point at the test DB (directUrl is used by Migrate).
  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_URL_DIRECT: TEST_DATABASE_URL,
    },
  })

  // Teardown: stop and remove the container after the suite finishes.
  return () => {
    execSync(`${COMPOSE} down`, { cwd: apiRoot, stdio: 'inherit' })
  }
}
