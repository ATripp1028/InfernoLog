// Spreadsheet import wizard. WizardStep values are strictly ordered (see
// STEP_ORDER in importWizardModel) and only ever move forward automatically —
// upload → review → checking-conflicts → resolve-conflicts → resolve-lists →
// committing → success. checking-conflicts and resolve-conflicts share a
// display slot ("Conflicts"), so finding no field conflicts shows as that
// step being skipped, never revisited; resolve-lists has its own slot
// ("Lists") since it's reachable either directly from checking-conflicts
// (no field conflicts, but a list merge is needed) or after resolve-conflicts
// finishes — either way it's a forward move. The only backward moves are
// explicit user actions (e.g. "Back to review" after an error, "Fix and
// re-upload" from the review step, or "Cancel" out of conflict/list
// resolution).
//
// Structured like the logging flow: every step is its own component under
// steps/, StepView maps the current step to one, and this file is only the
// shell — title, step indicator, and the shared cancel row. Every transition
// between steps is decided in useImportWizard.

import { Button } from '@/components/ui/button'
import { StepIndicator } from './WizardChrome'
import { UploadStep } from './steps/UploadStep'
import { ReviewStep } from './steps/ReviewStep'
import { CheckingConflictsStep } from './steps/CheckingConflictsStep'
import { ResolveConflictsStep } from './steps/ResolveConflictsStep'
import { ResolveListsStep } from './steps/ResolveListsStep'
import { CommittingStep } from './steps/CommittingStep'
import { SuccessStep } from './steps/SuccessStep'
import { useImportWizard } from './useImportWizard'
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

export function ImportWizard({
  me,
  onClose,
  skipConflictCheck = false,
}: ImportWizardProps) {
  const wizard = useImportWizard({ me, skipConflictCheck })
  const { step } = wizard

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

      <StepView
        wizard={wizard}
        skipConflictCheck={skipConflictCheck}
        onClose={onClose}
      />

      {/* resolve-conflicts/resolve-lists each have their own Cancel (back to
          review) inside FieldConflictMerge/ListMergeBoard, and committing has
          its own Close — showing this generic one too would put two
          differently-behaving buttons next to each other. */}
      {step !== 'success' &&
        step !== 'committing' &&
        step !== 'resolve-conflicts' &&
        step !== 'resolve-lists' && (
          <div className="pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
    </div>
  )
}

function StepView({
  wizard,
  skipConflictCheck,
  onClose,
}: {
  wizard: ReturnType<typeof useImportWizard>
  skipConflictCheck: boolean
  onClose: () => void
}) {
  switch (wizard.step) {
    case 'upload':
      return (
        <UploadStep
          dateFormat={wizard.dateFormat}
          onDateFormatChange={wizard.setDateFormat}
          onParsed={wizard.handleParsed}
        />
      )
    case 'review':
      return wizard.parseResult ? (
        <ReviewStep
          parseResult={wizard.parseResult}
          flags={wizard.allFlags}
          onSkipFlagged={wizard.handleSkipFlagged}
          onReUpload={() => wizard.setStep('upload')}
          showOverrideOption={!skipConflictCheck}
          blanketOverride={wizard.blanketOverride}
          onBlanketOverrideChange={wizard.setBlanketOverride}
        />
      ) : null
    case 'checking-conflicts':
      return (
        <CheckingConflictsStep
          commitError={wizard.commitError}
          onBackToReview={wizard.backToReview}
        />
      )
    case 'resolve-conflicts':
      return (
        <ResolveConflictsStep
          subStep={wizard.conflictSubStep}
          completionConflicts={wizard.completionConflicts}
          progressConflicts={wizard.progressConflicts}
          droppedConflicts={wizard.droppedConflicts}
          ratingConflicts={wizard.ratingConflicts}
          onCompletionsResolved={wizard.handleCompletionConflictsResolved}
          onProgressResolved={wizard.handleProgressConflictsResolved}
          onDroppedResolved={wizard.handleDroppedConflictsResolved}
          onRatingsResolved={wizard.handleRatingConflictsResolved}
          onCancel={wizard.handleConflictsCancelled}
        />
      )
    case 'resolve-lists':
      return wizard.currentListMerge ? (
        <ResolveListsStep
          current={wizard.currentListMerge}
          onConfirm={wizard.handleListMergeConfirmed}
          onCancel={wizard.handleListMergeCancelled}
        />
      ) : null
    case 'committing':
      return (
        <CommittingStep
          progress={wizard.progress}
          progressLabel={wizard.progressLabel}
          status={wizard.status}
          commitError={wizard.commitError}
          onBackToReview={wizard.backToReview}
          onClose={onClose}
        />
      )
    case 'success':
      return wizard.status ? (
        <SuccessStep status={wizard.status} onClose={onClose} />
      ) : null
    default:
      return null
  }
}
