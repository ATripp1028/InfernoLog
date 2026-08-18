import { PageLoading } from '@/components/shell/PageLoading'
import { useDiscordLinkComplete } from '@/features/settings/useDiscordLinkComplete'
import { Route } from '@/routes/_authenticated.auth.discord.complete'

/**
 * Interstitial that finishes a Discord link and immediately leaves.
 *
 * It renders nothing but the app's loading state: the user arrives here from
 * Discord and should land on /settings, having seen only a flicker. The work
 * lives in useDiscordLinkComplete.
 *
 * Mounted under `_authenticated` deliberately. The whole point of routing the
 * OAuth code through the frontend is that the exchange happens with a JWT
 * attached, so an unauthenticated visitor must be sent to sign in rather than
 * be allowed to complete anything.
 */
export function DiscordLinkComplete() {
  const { code, state } = Route.useSearch()
  useDiscordLinkComplete(code, state)
  return <PageLoading />
}
