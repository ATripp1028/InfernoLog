import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/generic/sonner'
import { PageLoading } from '@/components/shell/PageLoading'
import { meQueryKey, useMe } from '@/lib/api/me'
import { backOriginState } from '@/lib/backOrigin'
import { useImportStatus } from '@/lib/api/import'
import { AccountSection } from '@/features/settings/sections/AccountSection'
import { PrivacySection } from '@/features/settings/sections/PrivacySection'
import { LoggingSection } from '@/features/settings/sections/LoggingSection'
import { RatingSection } from '@/features/settings/sections/RatingSection'
import { DesignSection } from '@/features/settings/sections/DesignSection'
import { DangerZoneSection } from '@/features/settings/sections/DangerZoneSection'
import { useSettingsSaveNotifier } from '@/features/settings/hooks/useSettingsSaveNotifier'
import { ImportStatusPanel } from '@/features/import/ImportStatusPanel'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/generic/sheet'

/**
 * Account, privacy, display, logging, rating, and danger-zone settings.
 */
export function Settings() {
  // One "Saved" toast per burst of mutations — see the hook for details.
  useSettingsSaveNotifier()

  const me = useMe()
  const importStatus = useImportStatus()
  const search = useSearch({ from: '/_authenticated/settings' }) as {
    discord?: 'connected' | 'error'
    reason?: string
    importStatus?: true
  }
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [importStatusOpen, setImportStatusOpen] = useState(false)

  // Tracks which discord=... result we've already toasted for, so StrictMode's
  // double-invocation of this effect (or any other re-run before the
  // search-clearing navigate() below takes effect) doesn't show the toast twice.
  const handledDiscordResultRef = useRef<string | null>(null)

  useEffect(() => {
    if (!search.discord) {
      handledDiscordResultRef.current = null
      return
    }
    const resultKey = `${search.discord}:${search.reason ?? ''}`
    if (handledDiscordResultRef.current === resultKey) return
    handledDiscordResultRef.current = resultKey
    if (search.discord === 'connected') {
      // The completion mutation already wrote discordId into the cache (it had
      // the value first-hand, from an authenticated response). This used to
      // read the id out of the URL instead, because the write happened in a
      // server-side redirect the client never saw — and it toasted success
      // unconditionally, so a victim of the linking CSRF was told their own
      // account had connected while the link landed on someone else's.
      toast.success('Discord account connected')
      void queryClient.refetchQueries({ queryKey: meQueryKey })
    } else if (search.discord === 'error') {
      toast.error(discordErrorMessage(search.reason))
    }
    void navigate({ to: '/settings', replace: true, search: {} })
  }, [search.discord, search.reason, navigate, queryClient])

  useEffect(() => {
    if (!search.importStatus) return
    setImportStatusOpen(true)
    void navigate({ to: '/settings', replace: true, search: {} })
  }, [search.importStatus, navigate])

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
      <DesignSection me={me.data} />
      <DangerZoneSection />

      <footer className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link
          to="/about"
          state={backOriginState(location.href)}
          className="hover:text-foreground"
        >
          Acknowledgments &amp; credits
        </Link>
      </footer>

      <Sheet open={importStatusOpen} onOpenChange={setImportStatusOpen}>
        <SheetContent
          side="right"
          className="w-[480px] max-w-[95vw] overflow-y-auto p-6"
          aria-describedby="import-status-desc"
        >
          <SheetTitle>Import status</SheetTitle>
          <SheetDescription id="import-status-desc" className="sr-only">
            Current spreadsheet import job progress and flagged rows.
          </SheetDescription>
          {importStatus.data ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                {importStatus.data.status === 'running'
                  ? `Importing… ${importStatus.data.processedRows}/${importStatus.data.totalRows} rows`
                  : `Import complete — ${importStatus.data.outcomeCounts.committed} imported, ${importStatus.data.outcomeCounts.updated} updated, ${importStatus.data.outcomeCounts.skipped} skipped, ${importStatus.data.outcomeCounts.failed} failed`}
              </p>
              <ImportStatusPanel status={importStatus.data} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No import is currently in progress.
            </p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// `reason` codes come from two places: the API's public redirect target, which
// can only report that Discord itself didn't cooperate, and the authenticated
// completion endpoint, which reports everything else.
function discordErrorMessage(reason?: string): string {
  switch (reason) {
    case 'cancelled':
      return 'Discord connection cancelled.'
    case 'invalid_state':
      return 'The Discord connection link expired or was tampered with. Please try again.'
    case 'state_mismatch':
      // The completion request was authenticated as a different account than
      // the one that started the flow. Benignly, a stale tab left open across
      // an account switch; otherwise, someone else's connection link. The copy
      // covers both without accusing the user of anything.
      return 'That Discord connection link was started from a different account. Start again from your own settings.'
    case 'missing_code':
    case 'missing_state':
      return 'Discord didn’t return the required information. Please try again.'
    case 'exchange_failed':
      return 'Couldn’t reach Discord. Please try again.'
    case 'already_linked_elsewhere':
      return 'That Discord account is already connected to a different InfernoLog user.'
    case 'internal_error':
    default:
      return 'Something went wrong connecting Discord. Please try again.'
  }
}
