// Progress while the background import job runs. The job is server-side once
// started, so this step owns a Close button of its own: closing here abandons
// the view, not the import — progress stays visible via the persistent toast
// and Settings.

import { Button } from '@/components/ui/button'
import { ProgressBar } from '../WizardChrome'
import type { ImportStatusResponse } from '@/lib/api/import'

export function CommittingStep({
  progress,
  progressLabel,
  status,
  commitError,
  onBackToReview,
  onClose,
}: {
  progress: number
  // Shown before the job exists (while /start is still in flight), after
  // which the polled row counts take over.
  progressLabel: string
  status: ImportStatusResponse | null | undefined
  commitError: string | null
  onBackToReview: () => void
  onClose: () => void
}) {
  return (
    <div className="space-y-3 py-4">
      <ProgressBar value={progress} />
      <p className="text-sm text-muted-foreground text-center">
        {status?.status === 'running'
          ? `Importing… ${status.processedRows} / ${status.totalRows} rows`
          : progressLabel}
      </p>
      {commitError && (
        <div className="space-y-2 text-center">
          <p className="text-xs text-[var(--color-danger)]">{commitError}</p>
          <Button variant="outline" size="sm" onClick={onBackToReview}>
            Back to review
          </Button>
        </div>
      )}
      <div className="pt-2 border-t border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
