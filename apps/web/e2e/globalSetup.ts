// Runs once before the whole suite: resets the E2E user's data, then acquires
// a Cognito session for it and writes that session to disk as a Playwright
// `storageState`. Every spec starts from that file, so the app boots already
// authenticated and no test ever visits the OAuth flow.
//
// See docs/E2E_TESTING.md, "The auth problem", for why the session is minted
// out-of-band rather than driven through the browser.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderClient,
  NotAuthorizedException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider'
import { buildStorageState, type CognitoTokens } from './amplifyStorage'
import { BASE_URL, readE2eEnv } from './env'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

/** Where the signed-in session is written. Gitignored; rewritten every run. */
export const STORAGE_STATE_PATH = resolve(here, '.auth/storageState.json')

/**
 * Puts the E2E user's rows back to a known state by shelling out to the API
 * workspace's reset script, which owns the schema knowledge and reuses the
 * existing Prisma client.
 *
 * `DATABASE_URL` is passed explicitly from `E2E_DATABASE_URL` rather than
 * inherited: the script loads `apps/api/.env` for the Prisma CLI's benefit, so
 * an unset variable would silently resolve to a developer's local database.
 */
function resetUserData(stage: string, email: string) {
  const databaseUrl = process.env.E2E_DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      'E2E_DATABASE_URL is not set. It must point at the database for E2E_STAGE — the reset deletes rows, so it is never inherited from apps/api/.env.'
    )
  }

  execFileSync('pnpm', ['--filter', '@infernolog/api', 'e2e:reset'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      E2E_STAGE: stage,
      E2E_USER_EMAIL: email,
    },
  })
}

/**
 * Signs the native E2E user in with `ADMIN_USER_PASSWORD_AUTH`, which never
 * touches Google. The admin flow needs AWS credentials to call, which is
 * exactly why it is enabled on the E2E app client and not on the one the real
 * frontend ships with.
 */
async function mintTokens(
  userPoolId: string,
  clientId: string,
  email: string,
  password: string
): Promise<CognitoTokens> {
  const cognito = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
  })

  let response
  try {
    response = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: password },
      })
    )
  } catch (err) {
    if (
      err instanceof UserNotFoundException ||
      err instanceof NotAuthorizedException
    ) {
      throw new Error(
        `Cognito rejected the E2E sign-in for ${email}. Provision the user on this stage with \`pnpm --filter @infernolog/api e2e:provision\`, or check E2E_USER_PASSWORD.`,
        { cause: err }
      )
    }
    throw err
  }

  // A challenge means the identity exists but is not usable unattended —
  // almost always a password left in FORCE_CHANGE_PASSWORD state.
  if (response.ChallengeName) {
    throw new Error(
      `Cognito returned the ${response.ChallengeName} challenge instead of tokens. Re-run \`pnpm --filter @infernolog/api e2e:provision\` to set a permanent password.`
    )
  }

  const result = response.AuthenticationResult
  if (!result?.IdToken || !result.AccessToken || !result.RefreshToken) {
    throw new Error('Cognito returned an incomplete token set.')
  }

  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
  }
}

export default async function globalSetup() {
  const env = readE2eEnv()

  console.log(`[e2e] stage=${env.stage} api=${env.apiUrl}`)

  resetUserData(env.stage, env.email)

  const tokens = await mintTokens(
    env.userPoolId,
    env.clientId,
    env.email,
    env.password
  )

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true })
  writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify(buildStorageState(BASE_URL, env.clientId, tokens), null, 2)
  )

  console.log('[e2e] signed-in storage state written')
}
