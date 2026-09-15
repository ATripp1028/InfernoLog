import type {
  AuthErrorCode,
  PasswordSignupStartBody,
  PasswordSignupVerifyBody,
} from '@infernolog/core'
import { ApiError, apiFetch } from './client'

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

/**
 * Starts an email-and-password signup: the API emails a verification code to a
 * free address, or a notice to one that already has an account. Answers the
 * same way either way, so the caller always moves on to the code step.
 *
 * @throws {ApiError} 429 with code `RATE_LIMITED` when too many codes were requested.
 */
export async function passwordSignupStart(
  body: PasswordSignupStartBody
): Promise<void> {
  await apiFetch('/v1/auth/password-signup/start', { method: 'POST', body })
}

/**
 * Finishes the verification half of an email-and-password signup: checks the
 * emailed code and creates the sign-in. The caller then signs in with the same
 * email and password and calls {@link signupStart}.
 *
 * ⚠️ CREDENTIALS — the body carries the password and the code. Pass it straight
 * through; never log it or keep it anywhere but the flow's memory.
 *
 * @throws {ApiError} 400 `INVALID_CODE`, or 409 `ACCOUNT_EXISTS`.
 */
export async function passwordSignupVerify(
  body: PasswordSignupVerifyBody
): Promise<void> {
  await apiFetch('/v1/auth/password-signup/verify', { method: 'POST', body })
}

/**
 * The machine-readable `code` on an auth route's error, if it has one.
 *
 * @param error - Anything a call above rejected with.
 */
export function authErrorCode(error: unknown): AuthErrorCode | null {
  if (!(error instanceof ApiError)) return null
  const body = error.body
  if (body && typeof body === 'object' && 'code' in body) {
    const code = (body as { code: unknown }).code
    return typeof code === 'string' ? (code as AuthErrorCode) : null
  }
  return null
}
