// Provisions the dedicated E2E user: a native Cognito identity plus its
// InfernoLog `users` row. A one-time setup step per stage — the per-run reset
// is resetE2eUser.ts. See docs/E2E_TESTING.md.
//
// The user is native (username + password), NOT Google-federated, so the suite
// can sign in through ADMIN_USER_PASSWORD_AUTH without a browser ever visiting
// the OAuth flow. The consequence is that the suite does not exercise the
// federated login path; signup, sign-in rejection, and the postAuthentication
// trigger's cognitoSub backfill stay covered by the API's integration tests.
//
// Idempotent: re-running against an already-provisioned stage resets the
// password and reconciles the users row rather than erroring.
//
// Usage (from apps/api, with DATABASE_URL pointing at the target stage):
//   E2E_STAGE=staging \
//   E2E_USER_EMAIL=e2e+staging@… \
//   E2E_USER_PASSWORD=… \
//   COGNITO_USER_POOL_ID=$(aws ssm get-parameter \
//     --name /infernolog/staging/user-pool-id \
//     --query Parameter.Value --output text) \
//   pnpm e2e:provision
//
// dotenv/config must load before utils/prisma (which reads DATABASE_URL at
// import time), so it is the very first import.
import 'dotenv/config'
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider'
import prisma from '../utils/prisma'
import { createUserForSignup } from '../services/user'
import {
  assertNotProduction,
  describeDatabaseUrl,
  requireE2eEmail,
} from './e2eFixtures'

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

/**
 * Creates the Cognito identity if it does not exist, then forces the password
 * to a permanent one so `ADMIN_USER_PASSWORD_AUTH` returns tokens directly
 * rather than a NEW_PASSWORD_REQUIRED challenge.
 *
 * @returns The identity's `sub`, which is what `User.cognitoSub` is keyed to.
 */
async function ensureCognitoUser(
  userPoolId: string,
  email: string,
  password: string
): Promise<string> {
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        // No welcome email — this address is not a mailbox anyone reads.
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: 'InfernoLog E2E' },
        ],
      })
    )
    console.log(`Created Cognito user for ${email}.`)
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err
    console.log(`Cognito user for ${email} already exists — reusing it.`)
    // A pre-existing identity may predate the attributes above.
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
      })
    )
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    })
  )

  const described = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email })
  )
  const sub = described.UserAttributes?.find((a) => a.Name === 'sub')?.Value
  if (!sub) {
    throw new Error(`Cognito returned no sub for ${email}.`)
  }
  return sub
}

/**
 * Creates or reconciles the `users` row for the E2E identity.
 *
 * Row creation goes through the same `createUserForSignup` the real signup
 * route calls, so the E2E user gets the default rating categories and built-in
 * collections rather than a hand-rolled approximation that could drift.
 */
async function ensureUserRow(email: string, cognitoSub: string) {
  const existing = await prisma.user.findUnique({ where: { email } })

  if (!existing) {
    const created = await createUserForSignup(email, cognitoSub)
    await prisma.user.update({
      where: { id: created.id },
      data: { onboardingCompleted: true, legalAcceptedAt: new Date() },
    })
    console.log(`Created users row ${created.id} for ${email}.`)
    return created.id
  }

  // A stage that was torn down and redeployed hands the same email a new
  // Cognito identity, so the sub is repointed rather than trusted.
  if (existing.cognitoSub !== cognitoSub) {
    console.log(
      `Repointing users row ${existing.id} at Cognito sub ${cognitoSub}.`
    )
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: { cognitoSub, onboardingCompleted: true },
  })
  return existing.id
}

async function main() {
  const stage = assertNotProduction(process.env.E2E_STAGE)
  const email = requireE2eEmail()

  const userPoolId = process.env.COGNITO_USER_POOL_ID
  if (!userPoolId) {
    throw new Error(
      'COGNITO_USER_POOL_ID is required — read it from /infernolog/<stage>/user-pool-id.'
    )
  }
  const password = process.env.E2E_USER_PASSWORD
  if (!password) {
    throw new Error('E2E_USER_PASSWORD is required and has no default.')
  }

  console.log(
    `Provisioning ${email} on stage ${stage} via pool ${userPoolId} and ${describeDatabaseUrl(process.env.DATABASE_URL)}`
  )

  const sub = await ensureCognitoUser(userPoolId, email, password)
  const userId = await ensureUserRow(email, sub)

  console.log(
    `Provisioned E2E user ${email} (users.id ${userId}, sub ${sub}) on stage ${stage}.`
  )
}

main()
  .catch((err) => {
    if (err instanceof UserNotFoundException) {
      console.error(
        'Cognito reported the user as missing immediately after creating it — ' +
          'check that COGNITO_USER_POOL_ID matches the stage in E2E_STAGE.'
      )
    }
    console.error('Failed to provision the E2E user:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
