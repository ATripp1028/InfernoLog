// Entry point for `pnpm test:e2e`. Resolves the target stage's config from
// SSM, then hands off to the Playwright runner with that config in the
// environment.
//
// Why a wrapper rather than doing this inside playwright.config.ts: the config
// module is loaded synchronously, and both it and globalSetup need the same
// values. Resolving once here means the browser, the app build, and the token
// minting can never end up pointed at different stages.
//
// Extra arguments are forwarded, so `pnpm test:e2e --headed --grep ranking`
// works as it would with a bare `playwright test`.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { STAGE_PARAMETERS, requireStage } from './env'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')

/** Local, gitignored credentials for a developer run. See .env.e2e.example. */
const ENV_FILE = resolve(webRoot, '.env.e2e')

/**
 * Loads `.env.e2e` when it exists, so a developer run does not mean pasting
 * four variables (one of them a database URL containing `&`, which the shell
 * splits on unless quoted) on every invocation.
 *
 * `process.loadEnvFile` leaves variables that are already set alone, so an
 * explicit `E2E_STAGE=… pnpm test:e2e` still wins over the file, and CI —
 * which sets everything from secrets and never has this file — is unaffected.
 *
 * Note this file is NOT one Vite reads. Vite auto-loads `.env`, `.env.local`
 * and `.env.<mode>[.local]`, and the E2E build runs in production mode, so the
 * name cannot collide with the app's own configuration.
 */
function loadLocalEnv() {
  if (!existsSync(ENV_FILE)) return
  process.loadEnvFile(ENV_FILE)
  console.log('[e2e] loaded apps/web/.env.e2e')
}

/**
 * Reads the SSM parameters `apps/api/infra/outputs.ts` writes for a stage.
 *
 * A missing `e2e-client-id` is the signal that this stage has no E2E app
 * client — which, by construction, is what production looks like.
 */
async function resolveStageConfig(
  stage: string
): Promise<Record<string, string>> {
  const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  const resolved: Record<string, string> = {}

  for (const [variable, parameter] of Object.entries(STAGE_PARAMETERS)) {
    const name = `/infernolog/${stage}/${parameter}`
    try {
      const result = await ssm.send(new GetParameterCommand({ Name: name }))
      const value = result.Parameter?.Value
      if (!value) throw new Error(`${name} is empty.`)
      resolved[variable] = value
    } catch (err) {
      throw new Error(
        `Could not read ${name}. Is the api stack deployed to "${stage}", and are AWS credentials set?`,
        { cause: err }
      )
    }
  }

  return resolved
}

async function main() {
  loadLocalEnv()

  const stage = requireStage()
  const stageConfig = await resolveStageConfig(stage)

  const result = spawnSync(
    'npx',
    [
      'playwright',
      'test',
      '--config',
      resolve(here, 'playwright.config.ts'),
      ...process.argv.slice(2),
    ],
    {
      cwd: webRoot,
      stdio: 'inherit',
      env: { ...process.env, ...stageConfig },
    }
  )

  // `status` is null when the runner never started (npx missing, EACCES) or
  // was killed by a signal. Without this the whole thing exits 1 having
  // printed nothing, right after the SSM lookups appeared to succeed.
  if (result.error) {
    throw new Error('Could not start the Playwright runner.', {
      cause: result.error,
    })
  }
  if (result.status === null && result.signal) {
    console.error(`Playwright was terminated by ${result.signal}.`)
  }

  process.exit(result.status ?? 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
