import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'
import { useImportStatus, type ImportStatusResponse } from '@/lib/api/import'
import { INVALIDATE_ON_WRITE } from '@/lib/api/logging'

const TOAST_ID = 'import-status'

// Persistent (non-auto-dismissing) toast for the background import job.
// Mounted once at the authenticated app shell so it's driven purely by
// server state (useImportStatus) — it reappears on login/reload if a job is
// still active, regardless of which page or drawer state started it, and
// updates in place as processedRows changes / the job completes.
export function ImportStatusToast() {
  const importStatus = useImportStatus()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const wasVisible = useRef(false)
  const prevStatusRef = useRef<ImportStatusResponse['status'] | null>(null)

  // The worker writes completions/progress/ranking/collections/ratings
  // straight to Postgres — nothing else refetches those views on job
  // completion. Fire the same invalidation a manual log write would, once
  // per newly-observed completion (covers both the running->completed
  // transition and discovering an already-finished job on mount, e.g. after
  // a reload). This component is mounted exactly once at the app shell, so
  // prevStatusRef isn't duplicated across the other useImportStatus() call
  // sites that just display status.
  useEffect(() => {
    const status = importStatus.data?.status
    if (status === 'completed' && prevStatusRef.current !== 'completed') {
      for (const key of INVALIDATE_ON_WRITE) {
        void queryClient.invalidateQueries({ queryKey: key as unknown[] })
      }
    }
    prevStatusRef.current = status ?? null
  }, [importStatus.data?.status, queryClient])

  useEffect(() => {
    const data = importStatus.data
    const hasUnresolvedFlag =
      data?.flaggedRows.some((r) => !r.resolved) ?? false
    const visible =
      data?.status === 'running' ||
      (data?.status === 'completed' && hasUnresolvedFlag)

    if (!data || !visible) {
      if (wasVisible.current) toast.dismiss(TOAST_ID)
      wasVisible.current = false
      return
    }
    wasVisible.current = true

    const message =
      data.status === 'running'
        ? `Importing… ${data.processedRows}/${data.totalRows} rows`
        : `Import complete — ${data.flaggedRows.filter((r) => !r.resolved).length} row${
            data.flaggedRows.filter((r) => !r.resolved).length !== 1 ? 's' : ''
          } need review`

    toast.custom(
      () => (
        <button
          type="button"
          onClick={() =>
            navigate({ to: '/settings', search: { importStatus: true } })
          }
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 text-left text-sm text-foreground shadow-lg"
        >
          {message}
        </button>
      ),
      { id: TOAST_ID, position: 'bottom-left', duration: Infinity }
    )
  }, [importStatus.data, navigate])

  return null
}
