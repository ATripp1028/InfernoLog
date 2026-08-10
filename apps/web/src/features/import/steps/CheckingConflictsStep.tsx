import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useImportFlow } from '../ImportFlowProvider'

/**
 * The /me/import/check round trip. A step of its own (rather than a spinner
 * the shell draws) because it's the state that decides where the wizard goes
 * next — same reason logging's ResolvingStep exists.
 *
 * A failure here does NOT step backwards on its own; it offers an explicit
 * "Back to review", so every backward move stays a user action.
 */
export function CheckingConflictsStep() {
  const { commitError, backToReview } = useImportFlow()

  return (
    <div className="space-y-3 py-4">
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking for conflicts…
      </div>
      {commitError && (
        <div className="space-y-2 text-center">
          <p className="text-xs text-danger">{commitError}</p>
          <Button variant="outline" size="sm" onClick={backToReview}>
            Back to review
          </Button>
        </div>
      )}
    </div>
  )
}
