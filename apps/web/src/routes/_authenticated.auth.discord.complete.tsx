import { createFileRoute } from '@tanstack/react-router'
import { DiscordLinkComplete } from '@/pages/DiscordLinkComplete'

type DiscordCompleteSearch = {
  code?: string | undefined
  state?: string | undefined
}

export const Route = createFileRoute('/_authenticated/auth/discord/complete')({
  validateSearch: (search: Record<string, unknown>): DiscordCompleteSearch => ({
    code: typeof search.code === 'string' ? search.code : undefined,
    state: typeof search.state === 'string' ? search.state : undefined,
  }),
  component: DiscordLinkComplete,
})
