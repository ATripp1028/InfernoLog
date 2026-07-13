// Client-side-only age-gate cooldown. Deliberately not backed by any server
// state: per product decision, InfernoLog never persists anything about an
// unconfirmed (not-yet-signed-up) visitor, including a failed age check —
// that's the point of gating age before OAuth even starts. A plain cookie is
// a weak deterrent (a user who knows to clear cookies can retry), but it's
// enough to stop "just pick a different birthdate" retries from someone who
// told the truth once, without tracking anyone.

const COOKIE_NAME = 'il_agegate_failed'
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

export function hasActiveAgeGateFailureCookie(): boolean {
  return document.cookie
    .split('; ')
    .some((c) => c.startsWith(`${COOKIE_NAME}=`))
}

export function setAgeGateFailureCookie(): void {
  document.cookie = `${COOKIE_NAME}=1; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; samesite=lax`
}
