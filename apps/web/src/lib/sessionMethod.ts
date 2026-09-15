import { fetchAuthSession } from 'aws-amplify/auth'

/**
 * Whether the current session signed in with an email and password, rather
 * than through Google.
 *
 * A native Cognito user's ID token has no `identities` claim; a federated
 * one's does. Used after a password change that signed out every password
 * session — this one included — to decide whether to sign straight back in.
 */
export async function sessionUsesPassword(): Promise<boolean> {
  const session = await fetchAuthSession()
  const payload = session.tokens?.idToken?.payload
  return payload !== undefined && payload.identities === undefined
}
