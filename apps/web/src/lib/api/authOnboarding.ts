import { apiFetch } from './client'

// Called right after OAuth completes when the user clicked Sign Up (age gate
// already passed). Creates the InfernoLog `users` row.
export async function signupStart(token: string): Promise<void> {
  await apiFetch('/v1/auth/signup/start', { token, method: 'POST' })
}

// Called right after OAuth completes when the user clicked Sign In and
// GET /v1/me came back 404 (no matching account). Synchronously discards the
// just-created Cognito identity — no InfernoLog `users` row is ever created
// for this path.
export async function signinReject(token: string): Promise<void> {
  await apiFetch('/v1/auth/signin/reject', { token, method: 'POST' })
}
