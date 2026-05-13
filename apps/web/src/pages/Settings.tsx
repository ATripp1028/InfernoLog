import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'
import { PageLoading } from '@/components/PageLoading'
import { meQueryKey, useMe, type MeData } from '@/lib/api/me'
import { AccountSection } from '@/features/settings/sections/AccountSection'
import { PrivacySection } from '@/features/settings/sections/PrivacySection'
import { LoggingSection } from '@/features/settings/sections/LoggingSection'
import { RatingSection } from '@/features/settings/sections/RatingSection'
import { RankingSection } from '@/features/settings/sections/RankingSection'
import { DesignSection } from '@/features/settings/sections/DesignSection'

export function Settings() {
  const me = useMe()
  const search = useSearch({ from: '/_authenticated/settings' }) as {
    discord?: 'connected' | 'error'
    discordId?: string
    reason?: string
  }
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Handle the Discord OAuth callback redirect: surface the result as a toast
  // and patch the cache with the new discordId. The URL params are then
  // stripped so a refresh doesn't re-fire the toast.
  useEffect(() => {
    if (!search.discord) return
    if (search.discord === 'connected') {
      toast.success('Discord account connected')
      if (search.discordId) {
        const newDiscordId = search.discordId
        queryClient.setQueryData<MeData>(meQueryKey, (old) =>
          old ? { ...old, discordId: newDiscordId } : old
        )
      }
    } else if (search.discord === 'error') {
      toast.error(discordErrorMessage(search.reason))
    }
    void navigate({ to: '/settings', replace: true, search: {} })
  }, [search.discord, search.discordId, search.reason, navigate, queryClient])

  if (!me.data) {
    return <PageLoading />
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, preferences, and ranking behavior.
        </p>
      </header>

      <AccountSection me={me.data} />
      <PrivacySection me={me.data} />
      <LoggingSection me={me.data} />
      <RatingSection me={me.data} />
      <RankingSection me={me.data} />
      <DesignSection />
    </div>
  )
}

function discordErrorMessage(reason?: string): string {
  switch (reason) {
    case 'invalid_state':
      return 'The Discord connection link expired or was tampered with. Please try again.'
    case 'missing_code':
    case 'missing_state':
      return 'Discord didn’t return the required information. Please try again.'
    case 'token_exchange_failed':
    case 'user_fetch_failed':
      return 'Couldn’t reach Discord. Please try again.'
    case 'already_linked_elsewhere':
      return 'That Discord account is already connected to a different InfernoLog user.'
    case 'internal_error':
    default:
      return 'Something went wrong connecting Discord. Please try again.'
  }
}
