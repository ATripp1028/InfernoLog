import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { AlertDialog } from '@/components/ui/alert-dialog'
import {
  useRemoveGddlApiKey,
  useSetGddlApiKey,
  useGddlSync,
  useGddlListsSync,
  gddlSyncStatusQueryKey,
  type MeData,
  type GddlListSyncResult,
} from '@/lib/api/me'
import { useGddlSyncContext } from '../GddlSyncProvider'
import { ConnectedAccountRow } from './ConnectedAccountRow'

interface GddlApiKeyEditorProps {
  me: MeData
}

function buildListSyncToast(result: GddlListSyncResult): string {
  const totalAdded =
    result.favorites.addedToInferno.length +
    result.leastFavorites.addedToInferno.length
  const totalPushed =
    result.favorites.addedToGddl.length +
    result.leastFavorites.addedToGddl.length
  const totalRemoved =
    result.favorites.removedFromGddl.length +
    result.leastFavorites.removedFromGddl.length
  const totalSkipped =
    result.favorites.skipped.length + result.leastFavorites.skipped.length

  const parts: string[] = []
  if (totalAdded > 0)
    parts.push(
      `${totalAdded} level${totalAdded === 1 ? '' : 's'} added to InfernoLog`
    )
  if (totalPushed > 0) parts.push(`${totalPushed} pushed to GDDL`)
  if (totalRemoved > 0) parts.push(`${totalRemoved} removed from GDDL`)
  const summary = parts.length > 0 ? parts.join(', ') : 'Nothing to sync'
  return totalSkipped > 0
    ? `Lists synced — ${summary} · ${totalSkipped} level${totalSkipped === 1 ? '' : 's'} could not be cached`
    : `Lists synced — ${summary}`
}

/**
 * GDDL connection, presented like the Google/Discord rows. Connecting requires
 * pasting an API key (verified server-side); the key is write-only and never
 * sent back. When connected we show the confirmed GDDL username.
 */
export function GddlApiKeyEditor({ me }: GddlApiKeyEditorProps) {
  const setKey = useSetGddlApiKey()
  const removeKey = useRemoveGddlApiKey()
  const sync = useGddlSync()
  const listSync = useGddlListsSync()
  const { isSyncing: jobSyncing } = useGddlSyncContext()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [offerSync, setOfferSync] = useState(false)

  // Completion toast and list/ranking cache invalidation are handled by
  // GddlSyncProvider (mounted app-wide, polling the shared job-status query)
  // so they still fire if this component unmounts — e.g. the user navigates
  // away from Settings — before the job finishes.
  const isSyncing = sync.isPending || jobSyncing

  const save = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      toast.error('Enter an API key')
      return
    }
    try {
      const { gddlName } = await setKey.mutateAsync(trimmed)
      setValue('')
      setEditing(false)
      toast.success(`Successfully connected to GDDL user ${gddlName}!`)
      setOfferSync(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save API key')
    }
  }

  const disconnect = async () => {
    try {
      await removeKey.mutateAsync()
      setValue('')
      setEditing(false)
      setConfirmDisconnect(false)
      toast.success('GDDL account disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  const runSync = async () => {
    try {
      const { jobId } = await sync.mutateAsync()
      // The shared status query would pick this up on its next 2s poll
      // regardless; refetch now so the button/toast react immediately.
      void queryClient.invalidateQueries({ queryKey: gddlSyncStatusQueryKey })
      toast.loading('Syncing with GDDL…', { id: `gddl-sync-${jobId}` })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    }
  }

  const runListSync = async () => {
    try {
      const result = await listSync.mutateAsync()
      toast.success(buildListSyncToast(result))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'List sync failed')
    }
  }

  return (
    <div className="space-y-2">
      <ConnectedAccountRow
        icon={
          <img
            src="https://gdladder.com/favicon.ico"
            alt=""
            aria-hidden="true"
            className="h-5 w-5"
          />
        }
        providerName="GDDL"
        identifier={me.gddlUsername ? `GDDL user ${me.gddlUsername}` : null}
        action={
          editing ? null : me.hasGddlApiKey ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="border border-accent bg-transparent text-accent hover:bg-accent/10"
                onClick={() => void runSync()}
                disabled={isSyncing}
              >
                {isSyncing ? 'Syncing…' : 'Sync Completions'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runListSync()}
                disabled={listSync.isPending}
              >
                {listSync.isPending ? 'Syncing…' : 'Sync Lists'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDisconnect(true)}
                disabled={removeKey.isPending}
              >
                {removeKey.isPending ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              Connect
            </Button>
          )
        }
      />
      {editing && (
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            placeholder="Paste your GDDL API key"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={setKey.isPending}
          >
            {setKey.isPending ? 'Connecting…' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue('')
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <AlertDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect GDDL?"
        description="Your synced completions will remain, but InfernoLog will no longer be able to sync new data from your GDDL account."
        confirmLabel="Disconnect"
        destructive
        isPending={removeKey.isPending}
        onConfirm={() => void disconnect()}
      />

      <AlertDialog
        open={offerSync}
        onOpenChange={setOfferSync}
        title="Sync GDDL history?"
        description="Import your GDDL completion history into InfernoLog now? This is additive — it will never overwrite existing entries."
        confirmLabel="Sync now"
        cancelLabel="Maybe later"
        onConfirm={() => {
          setOfferSync(false)
          void runSync()
        }}
      />
    </div>
  )
}
