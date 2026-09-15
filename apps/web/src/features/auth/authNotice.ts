// One-shot messages carried across a navigation that loses React state — a
// full-page redirect through Cognito's logout endpoint, or a hop from one auth
// page to another.
//
// sessionStorage, read on arrival and cleared once shown. Holds only which
// notice to show, never an address or anything the user typed.

const KEY = 'il_auth_notice'

/** A message an auth page shows once on arrival. */
export type AuthNotice = 'account-exists' | 'password-reset'

const NOTICES: readonly AuthNotice[] = ['account-exists', 'password-reset']

/**
 * Leaves a notice for the next auth page to show.
 *
 * @param notice - Which message to show.
 */
export function setAuthNotice(notice: AuthNotice): void {
  try {
    sessionStorage.setItem(KEY, notice)
  } catch {
    // Storage blocked: the notice is a nicety, and the page works without it.
  }
}

/**
 * The waiting notice, without clearing it. Read it while rendering, then call
 * {@link clearAuthNotice} from an effect — clearing during render would lose it
 * to StrictMode's second render.
 */
export function peekAuthNotice(): AuthNotice | null {
  try {
    const value = sessionStorage.getItem(KEY)
    return NOTICES.includes(value as AuthNotice) ? (value as AuthNotice) : null
  } catch {
    return null
  }
}

/** Clears the waiting notice once it has been shown. */
export function clearAuthNotice(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
