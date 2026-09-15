// ⚠️ CREDENTIALS — this module sets passwords on Cognito users, so it holds
// plaintext passwords (as `Sensitive`) for the length of one SDK call. Never log
// one, never put one in an error. See CLAUDE.md "Credential handling".
//
// A PASSWORD sign-in method is its own native Cognito user, keyed by email
// (the pool's `usernames: ['email']`). It is created here, by the API, already
// confirmed and verified, only after the address has been proven with an
// emailed code — Cognito's own SignUp is disabled on the pool
// (allowAdminCreateUserOnly), and an unverified native user never exists.

import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InvalidPasswordException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import type { Sensitive } from '../../utils/sensitive'

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

function userPoolId(): string {
  const id = process.env.COGNITO_USER_POOL_ID
  if (!id) throw new Error('COGNITO_USER_POOL_ID is not set')
  return id
}

/**
 * The address already has a native Cognito user that an account signs in with.
 * Carries no address, so it is safe to log.
 */
export class PasswordUserExistsError extends Error {
  constructor() {
    super('A sign-in for this address already belongs to an account')
    this.name = 'PasswordUserExistsError'
  }
}

/**
 * Cognito refused the password. `PasswordSchema` mirrors the pool policy, so
 * this means the two have drifted. Carries no part of the password.
 */
export class PasswordRejectedError extends Error {
  constructor() {
    super('Cognito rejected the password against its policy')
    this.name = 'PasswordRejectedError'
  }
}

async function subForUsername(username: string): Promise<string> {
  const described = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: userPoolId(), Username: username })
  )
  const sub = described.UserAttributes?.find((a) => a.Name === 'sub')?.Value
  if (!sub) throw new Error('Cognito returned no sub for a native user')
  return sub
}

/**
 * Creates the native Cognito user for an email-and-password sign-in, confirmed
 * and with its email verified, and sets its permanent password.
 *
 * Call only after the address has been proven with a verification code.
 *
 * A native user can already exist for the address without belonging to any
 * account: a signup that created it and then never reached signup/start (the
 * tab closed). The code just proved the caller owns the address, so that
 * orphan is taken over and its password replaced. A native user an identity
 * already points at is refused instead.
 *
 * @param email - The verified address, lowercase.
 * @param password - The new password, already validated against the policy.
 * @returns The native user's sub.
 * @throws {PasswordUserExistsError} When an account already signs in with it.
 * @throws {PasswordRejectedError} When Cognito refuses the password.
 */
export async function createVerifiedPasswordUser(
  email: string,
  password: Sensitive
): Promise<{ cognitoSub: string }> {
  let cognitoSub: string | undefined
  try {
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId(),
        Username: email,
        // Cognito sends nothing: the address was verified with our own code,
        // and there is no temporary password to deliver.
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
      })
    )
    cognitoSub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err
    cognitoSub = await subForUsername(email)
    const attached = await prisma.authIdentity.findUnique({
      where: { cognitoSub },
      select: { id: true },
    })
    if (attached) throw new PasswordUserExistsError()
    logger.info({ cognitoSub }, 'Taking over an orphaned native Cognito user')
  }

  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId(),
        Username: email,
        Password: password.reveal(),
        // Permanent, so the first sign-in returns tokens rather than a
        // NEW_PASSWORD_REQUIRED challenge.
        Permanent: true,
      })
    )
  } catch (err) {
    if (err instanceof InvalidPasswordException) {
      throw new PasswordRejectedError()
    }
    throw err
  }

  cognitoSub ??= await subForUsername(email)
  return { cognitoSub }
}
