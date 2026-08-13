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
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { STAGE_PARAMETERS, requireStage } from './env'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')

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

  process.exit(result.status ?? 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
