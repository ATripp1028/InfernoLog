import { PageLoading } from '@/components/shell/PageLoading'
import { useGoogleProofComplete } from '@/features/settings/useGoogleProofComplete'
import { Route } from '@/routes/_authenticated.auth.google-proof'

/**
 * Interstitial that finishes a Google re-confirmation and immediately returns
 * to Settings.
 *
 * Under `_authenticated` deliberately, like DiscordLinkComplete: the proof is
 * only ever used on a request carrying the account's own session, so a visitor
 * without one is sent to sign in rather than allowed to complete anything.
 */
export function GoogleProofComplete() {
  const search = Route.useSearch()
  useGoogleProofComplete(search)
  return <PageLoading />
}
