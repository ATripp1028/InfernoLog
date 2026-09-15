import { Settings } from '@/pages/Settings'
import { createFileRoute } from '@tanstack/react-router'

type SettingsSearch = {
  discord?: 'connected' | 'error' | undefined
  google?: 'connected' | 'error' | 'reconfirmed' | undefined
  reason?: string | undefined
  importStatus?: true | undefined
}

export const Route = createFileRoute('/_authenticated/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    discord:
      search.discord === 'connected' || search.discord === 'error'
        ? search.discord
        : undefined,
    google:
      search.google === 'connected' ||
      search.google === 'error' ||
      search.google === 'reconfirmed'
        ? search.google
        : undefined,
    reason: typeof search.reason === 'string' ? search.reason : undefined,
    importStatus: search.importStatus === true ? true : undefined,
  }),
  component: Settings,
})
