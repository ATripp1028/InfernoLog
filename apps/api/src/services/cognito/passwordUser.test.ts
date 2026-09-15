/**
 * Unit tests for creating the native Cognito user behind an email-and-password
 * sign-in. Cognito and Prisma are mocked; the leak tests for the route that
 * calls this live in routes/auth/passwordSignup.integration.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})
vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))
vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class UsernameExistsException extends Error {}
  class InvalidPasswordException extends Error {}
  class NotAuthorizedException extends Error {}
  class UserNotFoundException extends Error {}
  const command = (name: string) =>
    class {
      readonly name = name
      constructor(public input: Record<string, unknown>) {}
    }
  return {
    CognitoIdentityProviderClient: class {
      send = mockSend
    },
    AdminCreateUserCommand: command('AdminCreateUser'),
    AdminGetUserCommand: command('AdminGetUser'),
    AdminSetUserPasswordCommand: command('AdminSetUserPassword'),
    AdminInitiateAuthCommand: command('AdminInitiateAuth'),
    AdminUserGlobalSignOutCommand: command('AdminUserGlobalSignOut'),
    AdminDeleteUserCommand: command('AdminDeleteUser'),
    UsernameExistsException,
    InvalidPasswordException,
    NotAuthorizedException,
    UserNotFoundException,
  }
})

const sdk = await import('@aws-sdk/client-cognito-identity-provider')
const UsernameExists = sdk.UsernameExistsException as unknown as new () => Error
const InvalidPassword =
  sdk.InvalidPasswordException as unknown as new () => Error
const NotAuthorized = sdk.NotAuthorizedException as unknown as new (
  message: string
) => Error
const UserNotFound = sdk.UserNotFoundException as unknown as new () => Error
const {
  CurrentPasswordIncorrectError,
  PasswordRejectedError,
  PasswordUserExistsError,
  TooManyPasswordAttemptsError,
  createVerifiedPasswordUser,
  signOutEverywhere,
  verifyCurrentPassword,
} = await import('./passwordUser')
const { deleteCognitoUserIfExists } = await import('./client')
const { Sensitive } = await import('../../utils/sensitive')

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const EMAIL = 'player@example.com'
const PASSWORD = 'Leak-Canary-Pa55!unit'

type Sent = { name: string; input: Record<string, unknown> }
const sent = () => mockSend.mock.calls.map((call) => call[0] as Sent)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('COGNITO_USER_POOL_ID', 'pool-1')
  mockSend.mockReset()
  prisma.authIdentity.findUnique.mockReset().mockResolvedValue(null)
})

describe('createVerifiedPasswordUser', () => {
  it('creates a verified user without a Cognito email, then sets a permanent password', async () => {
    mockSend.mockImplementation(async (command: Sent) =>
      command.name === 'AdminCreateUser'
        ? { User: { Attributes: [{ Name: 'sub', Value: 'sub-new' }] } }
        : {}
    )

    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).resolves.toEqual({ cognitoSub: 'sub-new' })

    const [create, setPassword] = sent()
    expect(create).toMatchObject({
      name: 'AdminCreateUser',
      input: {
        UserPoolId: 'pool-1',
        Username: EMAIL,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: EMAIL },
          { Name: 'email_verified', Value: 'true' },
        ],
      },
    })
    expect(create?.input).not.toHaveProperty('TemporaryPassword')
    expect(setPassword).toMatchObject({
      name: 'AdminSetUserPassword',
      input: { Username: EMAIL, Password: PASSWORD, Permanent: true },
    })
  })

  it('takes over an orphaned native user no identity points at', async () => {
    mockSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminCreateUser') throw new UsernameExists()
      if (command.name === 'AdminGetUser') {
        return { UserAttributes: [{ Name: 'sub', Value: 'sub-orphan' }] }
      }
      return {}
    })

    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).resolves.toEqual({ cognitoSub: 'sub-orphan' })
    expect(sent().map((c) => c.name)).toEqual([
      'AdminCreateUser',
      'AdminGetUser',
      'AdminSetUserPassword',
    ])
  })

  it('refuses a native user an account already signs in with, without touching its password', async () => {
    prisma.authIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
    } as never)
    mockSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminCreateUser') throw new UsernameExists()
      return { UserAttributes: [{ Name: 'sub', Value: 'sub-owned' }] }
    })

    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).rejects.toBeInstanceOf(PasswordUserExistsError)
    expect(sent().map((c) => c.name)).not.toContain('AdminSetUserPassword')
  })

  it('translates a policy rejection without carrying the password', async () => {
    mockSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminSetUserPassword') throw new InvalidPassword()
      return { User: { Attributes: [{ Name: 'sub', Value: 'sub-new' }] } }
    })

    const error = await createVerifiedPasswordUser(
      EMAIL,
      new Sensitive(PASSWORD)
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PasswordRejectedError)
    expect(String(error)).not.toContain(PASSWORD)
  })

  it('looks the sub up when creation did not return one', async () => {
    mockSend.mockImplementation(async (command: Sent) =>
      command.name === 'AdminGetUser'
        ? { UserAttributes: [{ Name: 'sub', Value: 'sub-looked-up' }] }
        : {}
    )

    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).resolves.toEqual({ cognitoSub: 'sub-looked-up' })
  })

  it('rethrows unexpected Cognito failures', async () => {
    mockSend.mockRejectedValueOnce(new Error('throttled'))
    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).rejects.toThrow('throttled')

    mockSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminSetUserPassword') throw new Error('down')
      return { User: { Attributes: [{ Name: 'sub', Value: 's' }] } }
    })
    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).rejects.toThrow('down')
  })

  it('fails loudly when Cognito returns no sub or the pool id is missing', async () => {
    mockSend.mockResolvedValue({})
    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).rejects.toThrow('no sub')

    vi.stubEnv('COGNITO_USER_POOL_ID', '')
    await expect(
      createVerifiedPasswordUser(EMAIL, new Sensitive(PASSWORD))
    ).rejects.toThrow('COGNITO_USER_POOL_ID is not set')
  })
})

describe('verifyCurrentPassword', () => {
  beforeEach(() => vi.stubEnv('COGNITO_SERVER_CLIENT_ID', 'server-client'))

  it('checks through the server client and returns on success', async () => {
    mockSend.mockResolvedValue({ ChallengeName: 'NEW_PASSWORD_REQUIRED' })

    await expect(
      verifyCurrentPassword(EMAIL, new Sensitive(PASSWORD))
    ).resolves.toBeUndefined()
    expect(sent()[0]).toMatchObject({
      name: 'AdminInitiateAuth',
      input: {
        ClientId: 'server-client',
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: EMAIL, PASSWORD },
      },
    })
  })

  it.each([
    [
      'a wrong password',
      new NotAuthorized('Incorrect username or password.'),
      CurrentPasswordIncorrectError,
    ],
    [
      'the lockout',
      new NotAuthorized('Password attempts exceeded'),
      TooManyPasswordAttemptsError,
    ],
    [
      'a missing native user',
      new UserNotFound(),
      CurrentPasswordIncorrectError,
    ],
  ])('translates %s', async (_label, rejection, expected) => {
    mockSend.mockRejectedValue(rejection)
    const error = await verifyCurrentPassword(
      EMAIL,
      new Sensitive(PASSWORD)
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(expected)
    expect(String(error)).not.toContain(PASSWORD)
  })

  it('rethrows anything else, and needs the server client configured', async () => {
    mockSend.mockRejectedValue(new Error('throttled'))
    await expect(
      verifyCurrentPassword(EMAIL, new Sensitive(PASSWORD))
    ).rejects.toThrow('throttled')

    vi.stubEnv('COGNITO_SERVER_CLIENT_ID', '')
    await expect(
      verifyCurrentPassword(EMAIL, new Sensitive(PASSWORD))
    ).rejects.toThrow('COGNITO_SERVER_CLIENT_ID is not set')
  })
})

describe('signOutEverywhere and deleteCognitoUserIfExists', () => {
  it('signs out every session of the native user', async () => {
    mockSend.mockResolvedValue({})
    await signOutEverywhere(EMAIL)
    expect(sent()[0]).toMatchObject({
      name: 'AdminUserGlobalSignOut',
      input: { UserPoolId: 'pool-1', Username: EMAIL },
    })
  })

  it('treats an already-deleted user as success and rethrows other failures', async () => {
    mockSend.mockRejectedValueOnce(new UserNotFound())
    await expect(deleteCognitoUserIfExists('sub-1')).resolves.toBeUndefined()

    mockSend.mockRejectedValueOnce(new Error('down'))
    await expect(deleteCognitoUserIfExists('sub-1')).rejects.toThrow('down')
  })
})
