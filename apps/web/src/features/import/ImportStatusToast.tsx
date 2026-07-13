import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from '@/components/ui/sonner'
import { useImportStatus } from '@/lib/api/import'

const TOAST_ID = 'import-status'

// Persistent (non-auto-dismissing) toast for the background import job.
// Mounted once at the authenticated app shell so it's driven purely by
// server state (useImportStatus) — it reappears on login/reload if a job is
// still active, regardless of which page or drawer state started it, and
// updates in place as processedRows changes / the job completes.
export function ImportStatusToast() {
  const importStatus = useImportStatus()
  const navigate = useNavigate()
  const wasVisible = useRef(false)

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
