import { Settings } from '@/pages/Settings'
import { createFileRoute } from '@tanstack/react-router'

type SettingsSearch = {
  discord?: 'connected' | 'error' | undefined
  discordId?: string | undefined
  reason?: string | undefined
  importStatus?: true | undefined
}

export const Route = createFileRoute('/_authenticated/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    discord:
      search.discord === 'connected' || search.discord === 'error'
        ? search.discord
        : undefined,
    discordId:
      typeof search.discordId === 'string' ? search.discordId : undefined,
    reason: typeof search.reason === 'string' ? search.reason : undefined,
    importStatus: search.importStatus === true ? true : undefined,
  }),
  component: Settings,
})
