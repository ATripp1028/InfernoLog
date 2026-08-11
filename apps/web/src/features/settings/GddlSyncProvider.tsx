import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { toast } from '@/components/generic/sonner'
import {
  useGddlSyncStatus,
  useAckGddlSync,
  type GddlSyncJobStatus,
} from '@/lib/api/me'
import { useInvalidateOnWrite } from '@/lib/api/logging'
import { buildSyncToast } from './gddlSyncToast'

interface GddlSyncContextValue {
  isSyncing: boolean
}

const GddlSyncContext = createContext<GddlSyncContextValue | null>(null)

/**
 * Polls GET /v1/me/gddl-sync (the user's current/most-recent job, no id
 * needed) at the authenticated app shell — mirrors ImportStatusToast/
 * useImportStatus for spreadsheet import — so the completion toast and
 * cache invalidation fire regardless of which page is open, and survive a
 * full page reload: the server is the source of truth for "the current
 * job," not client state. GddlSyncJob's id is stable per user (a new sync
 * overwrites the same row rather than inserting a fresh one), so `id`
 * alone can't distinguish one sync run's completion from the next — the
 * server tracks that per-run via `acknowledgedAt` (keyed together with
 * `startedAt`, since `id` repeats) instead: it resets whenever a sync
 * starts, and this effect calls POST /v1/me/gddl-sync/ack right after
 * showing the result, which GET then respects to stop returning that
 * completion. That's what actually prevents a stale completion from being
 * re-announced (e.g. after localStorage is cleared or on a different
 * device) — the `job === handledRef.current` check below is only an
 * in-memory guard against re-firing this effect for the same poll response
 * (react-query keeps the same object reference across polls via structural
 * sharing when nothing changed); it holds no state that needs to survive a
 * reload. Note the `['gddl-sync']` query is excluded from the persisted
 * query-client cache (apps/web/src/main.tsx) specifically so a page reload
 * can't rehydrate a stale, pre-acknowledgment job and replay this effect on
 * data that's already out of date server-side.
 */
export function GddlSyncProvider({ children }: { children: ReactNode }) {
  const status = useGddlSyncStatus()
  const invalidate = useInvalidateOnWrite()
  const ack = useAckGddlSync()
  const handledRef = useRef<GddlSyncJobStatus | null>(null)

  useEffect(() => {
    const job = status.data
    if (!job || job.status === 'pending') return
    if (job === handledRef.current) return
    handledRef.current = job

    ack.mutate(job)

    // `id` repeats across runs, so it alone isn't a safe toast key — mix in
    // `startedAt` (unique per run) so two distinct completions never collide
    // on the same toast id and silently replace one another.
    const toastId = `gddl-sync-${job.id}-${job.startedAt}`
    if (job.status === 'completed') {
      if (job.result) {
        toast.success(buildSyncToast(job.result), { id: toastId })
      }
      // Mirrors ImportStatusToast: the sync worker writes completions
      // straight to Postgres, so fire the same invalidation a manual log
      // write would (List/Ranking/Collections/whichever Level Page is open).
      void invalidate()
    } else {
      toast.error(job.error ?? 'Sync failed', { id: toastId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data])

  return (
    <GddlSyncContext.Provider
      value={{ isSyncing: status.data?.status === 'pending' }}
    >
      {children}
    </GddlSyncContext.Provider>
  )
}

/**
 * The app-wide GDDL sync job state. Throws outside its provider.
 */
export function useGddlSyncContext(): GddlSyncContextValue {
  const ctx = useContext(GddlSyncContext)
  if (!ctx) {
    throw new Error('useGddlSyncContext must be used within GddlSyncProvider')
  }
  return ctx
}
