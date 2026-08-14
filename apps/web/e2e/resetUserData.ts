// Puts the E2E user's rows back to the baseline, by shelling out to the API
// workspace's `e2e:reset` script — which owns the schema knowledge and reuses
// the existing Prisma client.
//
// Called twice over: once from globalSetup before the run, and again before
// any retry (see testBase.ts). Those are different jobs. The first gives the
// run a known starting point; the second stops a half-finished attempt from
// changing what the retry is even testing.

import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

/**
 * Resets the E2E user identified by `email` on `stage`.
 *
 * `DATABASE_URL` is passed explicitly from `E2E_DATABASE_URL` rather than
 * inherited: the script loads `apps/api/.env` for the Prisma CLI's benefit, so
 * an unset variable would silently resolve to a developer's local database.
 *
 * @throws If `E2E_DATABASE_URL` is unset, or the script exits non-zero — with
 * the script's own stderr attached, since that carries which database it tried.
 */
export async function resetUserData(
  stage: string,
  email: string
): Promise<void> {
  const databaseUrl = process.env.E2E_DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      'E2E_DATABASE_URL is not set. It must point at the database for E2E_STAGE — the reset deletes rows, so it is never inherited from apps/api/.env.'
    )
  }

  try {
    const { stdout } = await execFileAsync(
      'pnpm',
      ['--filter', '@infernolog/api', 'e2e:reset'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          E2E_STAGE: stage,
          E2E_USER_EMAIL: email,
        },
      }
    )
    // The script names the database it connected to; that line is the whole
    // point of it, so it is surfaced rather than swallowed.
    process.stdout.write(stdout)
  } catch (err) {
    const { stdout = '', stderr = '' } = err as {
      stdout?: string
      stderr?: string
    }
    throw new Error(`Failed to reset the E2E user.\n${stdout}${stderr}`, {
      cause: err,
    })
  }
}
