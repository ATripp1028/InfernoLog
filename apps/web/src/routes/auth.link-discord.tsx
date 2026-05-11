import { createFileRoute } from '@tanstack/react-router'
import { LinkDiscord } from '../pages/LinkDiscord'

type LinkDiscordSearch = { token: string }

export const Route = createFileRoute('/auth/link-discord')({
  validateSearch: (search: Record<string, unknown>): LinkDiscordSearch => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: LinkDiscordRoute,
})

function LinkDiscordRoute() {
  const { token } = Route.useSearch()
  return <LinkDiscord token={token} />
}
