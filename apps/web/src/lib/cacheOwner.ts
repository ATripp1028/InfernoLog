import { queryClient } from './queryClient'
import { persister } from './persister'

/**
 * Which Cognito identity the persisted query cache belongs to.
 *
 * The persister writes to one fixed localStorage key, so without this the
 * cache is scoped to the browser rather than to the account. That cache holds
 * `MeData` (email, username, linked Discord id) and the user's whole progress
 * list for a full day, and it is restored synchronously at mount — before any
 * token has been read. On a shared browser that means account B's first frames
 * render account A's data, and A's email sits in B's localStorage until it
 * ages out.
 *
 * `il_preset_*` already keys its cookie by user id for exactly this reason;
 * this is the same rule applied to the much larger cache.
 */
const OWNER_KEY = 'infernolog:cache-owner'

async function discardCache(): Promise<void> {
  queryClient.clear()
  await persister.removeClient()
}

/**
 * Records `sub` as the persisted cache's owner, discarding the cache first if
 * it belonged to anyone else.
 *
 * A cache with no recorded owner is also discarded: it predates this key, so
 * its provenance is unknown, and unknown has to be treated as "someone else's"
 * rather than "probably fine". The cost is one extra refetch on the upgrade.
 *
 * Callers must await this before rendering anything authenticated — every
 * authenticated route already blocks on `isAuthInitializing`, which is what
 * gives this the window it needs.
 *
 * @param sub - The Cognito `sub` of the signed-in identity.
 */
export async function claimCacheOwner(sub: string): Promise<void> {
  let owner: string | null = null
  try {
    owner = localStorage.getItem(OWNER_KEY)
  } catch {
    // Storage disabled or full — treat as "no owner" and discard below.
  }

  if (owner !== sub) await discardCache()

  try {
    localStorage.setItem(OWNER_KEY, sub)
  } catch {
    // Best effort. A write failure only costs a redundant discard next launch.
  }
}

/**
 * Drops the persisted cache and forgets its owner.
 *
 * Called on sign-out and on a failed token refresh — both mean this browser
 * should no longer hold the account's data, and leaving the owner behind would
 * let the next sign-in by the same account restore a cache that the sign-out
 * was supposed to have destroyed.
 */
export async function releaseCacheOwner(): Promise<void> {
  await discardCache()
  try {
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // Nothing to do — the cache itself is already gone.
  }
}
