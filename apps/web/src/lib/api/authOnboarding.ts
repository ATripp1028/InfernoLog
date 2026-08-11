import { apiFetch } from './client'

/**
 * The InfernoLog user row created (or found) by {@link signupStart}.
 */
export interface SignupStartResult {
  id: string
  onboardingCompleted: boolean
}

/**
 * Called right after OAuth completes when the user clicked Sign Up (age gate
 * already passed). Creates the InfernoLog `users` row — or, if this Google
 * account already has one (e.g. it went through Sign Up by mistake instead
 * of Sign In), returns that existing row unchanged. The caller uses
 * onboardingCompleted to decide whether to route into the wizard or straight
 * into the app.
 */
export async function signupStart(token: string): Promise<SignupStartResult> {
  const { data } = await apiFetch<{ data: SignupStartResult }>(
    '/v1/auth/signup/start',
    { token, method: 'POST' }
  )
  return data
}

/**
 * Called right after OAuth completes when the user clicked Sign In and
 * GET /v1/me came back 404 (no matching account). Synchronously discards the
 * just-created Cognito identity — no InfernoLog `users` row is ever created
 * for this path.
 */
export async function signinReject(token: string): Promise<void> {
  await apiFetch('/v1/auth/signin/reject', { token, method: 'POST' })
}
