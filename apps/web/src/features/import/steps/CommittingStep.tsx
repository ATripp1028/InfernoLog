import { Button } from '@/components/ui/button'
import { ProgressBar } from '../WizardChrome'
import { useImportFlow } from '../ImportFlowProvider'

/**
 * Progress while the background import job runs. The job is server-side once
 * started, so this step owns a Close button of its own: closing here abandons
 * the view, not the import — progress stays visible via the persistent toast
 * and Settings.
 */
export function CommittingStep() {
  // `progressLabel` carries the message before the job exists (while /start
  // is still in flight); after that the polled row counts take over.
  const { progress, progressLabel, status, commitError, backToReview, close } =
    useImportFlow()

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
          <p className="text-xs text-danger">{commitError}</p>
          <Button variant="outline" size="sm" onClick={backToReview}>
            Back to review
          </Button>
        </div>
      )}
      <div className="pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={close}>
          Close
        </Button>
      </div>
    </div>
  )
}
