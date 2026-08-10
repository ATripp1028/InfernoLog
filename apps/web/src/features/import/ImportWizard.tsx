import { Button } from '@/components/ui/button'
import { StepIndicator } from './WizardChrome'
import { ImportFlowProvider, useImportFlow } from './ImportFlowProvider'
import { UploadStep } from './steps/UploadStep'
import { ReviewStep } from './steps/ReviewStep'
import { CheckingConflictsStep } from './steps/CheckingConflictsStep'
import { ResolveConflictsStep } from './steps/ResolveConflictsStep'
import { ResolveListsStep } from './steps/ResolveListsStep'
import { CommittingStep } from './steps/CommittingStep'
import { SuccessStep } from './steps/SuccessStep'
import type { MeData } from '@/lib/api/me'

interface ImportWizardProps {
  me: MeData
  onClose: () => void
  // Onboarding: a brand-new account can't already have completions, so
  // there's nothing to conflict with — skips the conflict-check round trip,
  // the Conflicts step, and the resolution UI entirely rather than showing
  // UI for a case that can never occur.
  skipConflictCheck?: boolean
}

/**
 * Spreadsheet import wizard. WizardStep values are strictly ordered (see
 * STEP_ORDER in importWizardModel) and only ever move forward automatically —
 * upload → review → checking-conflicts → resolve-conflicts → resolve-lists →
 * committing → success. checking-conflicts and resolve-conflicts share a
 * display slot ("Conflicts"), so finding no field conflicts shows as that
 * step being skipped, never revisited; resolve-lists has its own slot
 * ("Lists") since it's reachable either directly from checking-conflicts
 * (no field conflicts, but a list merge is needed) or after resolve-conflicts
 * finishes — either way it's a forward move. The only backward moves are
 * explicit user actions (e.g. "Back to review" after an error, "Fix and
 * re-upload" from the review step, or "Cancel" out of conflict/list
 * resolution).
 *
 * Structured like the logging flow: the step machine lives in
 * ImportFlowProvider, every step is its own component under steps/ reading
 * that context directly, StepView maps the current step to one, and this file
 * is only the shell — title, step indicator, and the shared cancel row.
 */
export function ImportWizard({
  me,
  onClose,
  skipConflictCheck = false,
}: ImportWizardProps) {
  return (
    <ImportFlowProvider
      me={me}
      onClose={onClose}
      skipConflictCheck={skipConflictCheck}
    >
      <WizardShell />
    </ImportFlowProvider>
  )
}

function WizardShell() {
  const { step, skipConflictCheck, close } = useImportFlow()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import spreadsheet</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bring your completion history into InfernoLog from an existing
          spreadsheet.
        </p>
      </div>

      <StepIndicator step={step} skipConflictCheck={skipConflictCheck} />

      <StepView />

      {/* resolve-conflicts/resolve-lists each have their own Cancel (back to
          review) inside FieldConflictMerge/ListMergeBoard, and committing has
          its own Close — showing this generic one too would put two
          differently-behaving buttons next to each other. */}
      {step !== 'success' &&
        step !== 'committing' &&
        step !== 'resolve-conflicts' &&
        step !== 'resolve-lists' && (
          <div className="pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
          </div>
        )}
    </div>
  )
}

function StepView() {
  const { step } = useImportFlow()

  switch (step) {
    case 'upload':
      return <UploadStep />
    case 'review':
      return <ReviewStep />
    case 'checking-conflicts':
      return <CheckingConflictsStep />
    case 'resolve-conflicts':
      return <ResolveConflictsStep />
    case 'resolve-lists':
      return <ResolveListsStep />
    case 'committing':
      return <CommittingStep />
    case 'success':
      return <SuccessStep />
    default:
      return null
  }
}
