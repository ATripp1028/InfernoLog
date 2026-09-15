// The Cognito SDK client and the user-pool operations more than one route
// needs. Separate from passwordUser.ts, which is the only module that handles
// passwords.

import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider'

/** The shared Cognito client for the API's own region. */
export const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

/**
 * The user pool every stage's API talks to, from `COGNITO_USER_POOL_ID`.
 *
 * @throws When the variable is unset, so a misconfigured Lambda fails loudly
 *   instead of calling Cognito with an undefined pool.
 */
export function userPoolId(): string {
  const id = process.env.COGNITO_USER_POOL_ID
  if (!id) throw new Error('COGNITO_USER_POOL_ID is not set')
  return id
}

/**
 * Deletes a Cognito user, treating one that is already gone as success (a
 * concurrent request, or an earlier attempt that deleted it and then failed).
 *
 * @param username - The user's sub; Cognito accepts it as the username for
 *   native and federated users alike.
 */
export async function deleteCognitoUserIfExists(
  username: string
): Promise<void> {
  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId(),
        Username: username,
      })
    )
  } catch (err) {
    if (!(err instanceof UserNotFoundException)) throw err
  }
}
