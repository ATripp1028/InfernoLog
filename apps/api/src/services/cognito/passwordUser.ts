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
  AdminUpdateUserAttributesCommand,
  AliasExistsException,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  InvalidPasswordException,
  NotAuthorizedException,
  UserNotFoundException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'
import type { Sensitive } from '../../utils/sensitive'
import { cognito, deleteCognitoUserIfExists, userPoolId } from './client'

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

  await setPermanentPassword(email, password)

  cognitoSub ??= await subForUsername(email)
  return { cognitoSub }
}

/**
 * Replaces a native user's password.
 *
 * @param email - The native user's sign-in email.
 * @param password - The new password, already validated against the policy.
 * @throws {PasswordRejectedError} When Cognito refuses the password.
 */
export async function setPermanentPassword(
  email: string,
  password: Sensitive
): Promise<void> {
  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId(),
        Username: email,
        Password: password.reveal(),
        // Permanent, so the next sign-in returns tokens rather than a
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
}

/** The password given to confirm a change was wrong. Carries no part of it. */
export class CurrentPasswordIncorrectError extends Error {
  constructor() {
    super('The current password was incorrect')
    this.name = 'CurrentPasswordIncorrectError'
  }
}

/**
 * Cognito has temporarily locked password checks for this user after repeated
 * failures. This lockout is what rate-limits guessing through
 * PUT /v1/me/password: it is per user, and it grows with each failure.
 */
export class TooManyPasswordAttemptsError extends Error {
  constructor() {
    super('Too many password attempts for this user')
    this.name = 'TooManyPasswordAttemptsError'
  }
}

/**
 * Checks a native user's current password, through the server-only app client
 * (`ADMIN_USER_PASSWORD_AUTH`, which needs IAM to call). The tokens a correct
 * password produces are discarded unread.
 *
 * @param email - The native user's sign-in email.
 * @param password - The password to check.
 * @throws {CurrentPasswordIncorrectError} When it is wrong.
 * @throws {TooManyPasswordAttemptsError} When Cognito has locked checks.
 */
export async function verifyCurrentPassword(
  email: string,
  password: Sensitive
): Promise<void> {
  const clientId = process.env.COGNITO_SERVER_CLIENT_ID
  if (!clientId) throw new Error('COGNITO_SERVER_CLIENT_ID is not set')
  try {
    // A challenge in the response still means the password was accepted;
    // nothing here continues it.
    await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId(),
        ClientId: clientId,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: password.reveal() },
      })
    )
  } catch (err) {
    if (err instanceof NotAuthorizedException) {
      // Cognito uses the one exception for both; only the message differs,
      // and the message never contains the password.
      throw /attempts exceeded/i.test(err.message)
        ? new TooManyPasswordAttemptsError()
        : new CurrentPasswordIncorrectError()
    }
    if (err instanceof UserNotFoundException) {
      throw new CurrentPasswordIncorrectError()
    }
    throw err
  }
}

/**
 * Revokes every refresh token a native user holds, signing out every session
 * that signed in with the password — including the caller's own, if that is
 * how they signed in. Sessions of the account's other sign-in methods are
 * separate Cognito users and are untouched.
 *
 * @param email - The native user's sign-in email.
 */
export async function signOutEverywhere(email: string): Promise<void> {
  await cognito.send(
    new AdminUserGlobalSignOutCommand({
      UserPoolId: userPoolId(),
      Username: email,
    })
  )
}

async function setNativeUserEmail(
  currentEmail: string,
  nextEmail: string
): Promise<void> {
  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId(),
      Username: currentEmail,
      UserAttributes: [
        { Name: 'email', Value: nextEmail },
        // Verified by the caller, with our own emailed code.
        { Name: 'email_verified', Value: 'true' },
      ],
    })
  )
}

/**
 * Moves a native user's sign-in email to a new, already-verified address.
 *
 * The pool signs native users in by email, and an email names at most one
 * native user. A native user can already hold the new address without any
 * account owning it — a signup that stopped before creating its account — and
 * the code the caller just verified proves the address is theirs, so that
 * leftover is deleted and the move retried. One an account signs in with is
 * refused.
 *
 * @param currentEmail - The native user's email now.
 * @param nextEmail - The verified address to move it to.
 * @throws {PasswordUserExistsError} When an account already signs in with the
 *   new address.
 */
export async function changeNativeUserEmail(
  currentEmail: string,
  nextEmail: string
): Promise<void> {
  try {
    await setNativeUserEmail(currentEmail, nextEmail)
    return
  } catch (err) {
    if (!(err instanceof AliasExistsException)) throw err
  }

  const leftover = await subForUsername(nextEmail)
  const attached = await prisma.authIdentity.findUnique({
    where: { cognitoSub: leftover },
    select: { id: true },
  })
  if (attached) throw new PasswordUserExistsError()
  logger.info(
    { cognitoSub: leftover },
    'Deleting an orphaned native Cognito user'
  )
  await deleteCognitoUserIfExists(leftover)
  await setNativeUserEmail(currentEmail, nextEmail)
}

/**
 * Puts a native user's email back after the account update that followed
 * {@link changeNativeUserEmail} failed, so the sign-in email and the account
 * email never disagree. A failure here is left for the caller to report.
 *
 * @param nextEmail - Where the native user's email was moved to.
 * @param previousEmail - Where to move it back.
 */
export async function revertNativeUserEmail(
  nextEmail: string,
  previousEmail: string
): Promise<void> {
  await setNativeUserEmail(nextEmail, previousEmail)
}
