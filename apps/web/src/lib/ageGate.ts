// Client-side-only age-gate cooldown. Deliberately not backed by any server
// state: per product decision, InfernoLog never persists anything about an
// unconfirmed (not-yet-signed-up) visitor, including a failed age check —
// that's the point of gating age before OAuth even starts. A plain cookie is
// a weak deterrent (a user who knows to clear cookies can retry), but it's
// enough to stop "just pick a different birthdate" retries from someone who
// told the truth once, without tracking anyone.

const COOKIE_NAME = 'il_agegate_failed'
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days
// See presetCookie.ts — Secure everywhere but the http:// dev server.
const SECURE = location.protocol === 'https:' ? '; Secure' : ''

/**
 * Whether this browser failed the age gate within the cooldown window.
 */
export function hasActiveAgeGateFailureCookie(): boolean {
  return document.cookie
    .split('; ')
    .some((c) => c.startsWith(`${COOKIE_NAME}=`))
}

/**
 * Starts the 30-day age-gate cooldown for this browser.
 */
export function setAgeGateFailureCookie(): void {
  document.cookie = `${COOKIE_NAME}=1; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax${SECURE}`
}

const PASSED_KEY = 'il_agegate_passed'

/**
 * Records that this tab passed the age gate, so /signup may render.
 *
 * sessionStorage, not a cookie: it lasts only for this tab's visit and is
 * never sent anywhere. Like the failure cookie above it is a UX gate, not
 * enforcement — the API cannot know a visitor's age either way.
 */
export function markAgeGatePassed(): void {
  try {
    sessionStorage.setItem(PASSED_KEY, '1')
  } catch {
    // Storage blocked: /signup will send the visitor back through the gate.
  }
}

/**
 * Whether this tab passed the age gate. See {@link markAgeGatePassed}.
 */
export function hasPassedAgeGate(): boolean {
  try {
    return sessionStorage.getItem(PASSED_KEY) === '1'
  } catch {
    return false
  }
}
