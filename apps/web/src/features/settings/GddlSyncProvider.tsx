import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'
import { useGddlSyncStatus, type GddlSyncResult } from '@/lib/api/me'
import { listQueryKey } from '@/lib/api/list'
import { rankingQueryKey } from '@/lib/api/ranking'
import {
  getHandledGddlSyncJobId,
  setHandledGddlSyncJobId,
} from '@/lib/gddlSyncStorage'

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

interface GddlSyncContextValue {
  isSyncing: boolean
}

const GddlSyncContext = createContext<GddlSyncContextValue | null>(null)

// Polls GET /v1/me/gddl-sync (the user's current/most-recent job, no id
// needed) at the authenticated app shell — mirrors ImportStatusToast/
// useImportStatus for spreadsheet import — so the completion toast and
// list/ranking cache invalidation fire regardless of which page is open,
// and survive a full page reload: the server is the source of truth for
// "the current job," not client state. The only client-side bookkeeping
// left is which job id we've already reacted to (gddlSyncStorage), since
// the endpoint keeps returning the latest job long after it's finished.
export function GddlSyncProvider({ children }: { children: ReactNode }) {
  const status = useGddlSyncStatus()
  const queryClient = useQueryClient()

  useEffect(() => {
    const job = status.data
    if (!job || job.status === 'pending') return
    if (job.id === getHandledGddlSyncJobId()) return

    setHandledGddlSyncJobId(job.id)

    if (job.status === 'completed') {
      if (job.result) {
        toast.success(buildSyncToast(job.result), {
          id: `gddl-sync-${job.id}`,
        })
      }
      void queryClient.invalidateQueries({ queryKey: listQueryKey })
      void queryClient.invalidateQueries({ queryKey: rankingQueryKey })
    } else {
      toast.error(job.error ?? 'Sync failed', { id: `gddl-sync-${job.id}` })
    }
  }, [status.data, queryClient])

  return (
    <GddlSyncContext.Provider
      value={{ isSyncing: status.data?.status === 'pending' }}
    >
      {children}
    </GddlSyncContext.Provider>
  )
}

export function useGddlSyncContext(): GddlSyncContextValue {
  const ctx = useContext(GddlSyncContext)
  if (!ctx) {
    throw new Error('useGddlSyncContext must be used within GddlSyncProvider')
  }
  return ctx
}
