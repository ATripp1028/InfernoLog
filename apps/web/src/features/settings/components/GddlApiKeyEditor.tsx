import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { AlertDialog } from '@/components/ui/alert-dialog'
import {
  useRemoveGddlApiKey,
  useSetGddlApiKey,
  useGddlSync,
  useGddlSyncStatus,
  type MeData,
  type GddlSyncResult,
} from '@/lib/api/me'
import { listQueryKey } from '@/lib/api/list'
import { rankingQueryKey } from '@/lib/api/ranking'
import { ConnectedAccountRow } from './ConnectedAccountRow'

interface GddlApiKeyEditorProps {
  me: MeData
}

function buildSyncToast(result: GddlSyncResult): string {
  const parts: string[] = []
  if (result.created > 0)
    parts.push(
      `${result.created} completion${result.created === 1 ? '' : 's'} added`
    )
  if (result.enriched > 0) parts.push(`${result.enriched} enriched`)
  const summary = parts.length > 0 ? parts.join(', ') : 'Nothing new to import'
  if (result.errors.length > 0) {
    return `Sync complete — ${summary} · ${result.errors.length} level${result.errors.length === 1 ? '' : 's'} could not be imported`
  }
  return `Sync complete — ${summary}`
}

// GDDL connection, presented like the Google/Discord rows. Connecting requires
// pasting an API key (verified server-side); the key is write-only and never
// sent back. When connected we show the confirmed GDDL username.
export function GddlApiKeyEditor({ me }: GddlApiKeyEditorProps) {
  const setKey = useSetGddlApiKey()
  const removeKey = useRemoveGddlApiKey()
  const sync = useGddlSync()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [offerSync, setOfferSync] = useState(false)
  const [syncJobId, setSyncJobId] = useState<string | null>(null)

  const syncStatus = useGddlSyncStatus(syncJobId)

  // Watch for the worker to finish and update the toast accordingly.
  useEffect(() => {
    if (!syncJobId || !syncStatus.data) return
    const { status, result, error } = syncStatus.data
    if (status === 'completed' && result) {
      toast.success(buildSyncToast(result), { id: `gddl-sync-${syncJobId}` })
      void queryClient.invalidateQueries({ queryKey: listQueryKey })
      void queryClient.invalidateQueries({ queryKey: rankingQueryKey })
      setSyncJobId(null)
    } else if (status === 'failed') {
      toast.error(error ?? 'Sync failed', { id: `gddl-sync-${syncJobId}` })
      setSyncJobId(null)
    }
  }, [syncStatus.data?.status, syncJobId, queryClient])

  const isSyncing = sync.isPending || syncJobId !== null

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
      toast.success('GDDL account disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  const runSync = async () => {
    try {
      const { jobId } = await sync.mutateAsync()
      setSyncJobId(jobId)
      toast.loading('Syncing with GDDL…', { id: `gddl-sync-${jobId}` })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
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
                className="border border-orange-500 bg-transparent text-orange-500 hover:bg-orange-500/10"
                onClick={() => void runSync()}
                disabled={isSyncing}
              >
                {isSyncing ? 'Syncing…' : 'Sync with GDDL'}
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
