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
// Upload — file picker + date format selector + client validation.
// Review — flags/counts from parsing.
// Checking-conflicts — one network round trip for every tab's conflict
//   detection (field-level AND list-merge — see /me/import/check).
// Resolve-conflicts — canonical git-merge-style resolution (drop / overwrite
//   / merge, per field or in bulk — see FieldConflictMerge) for whichever
//   rows the check above found conflicting. Internally a linear sequence of
//   sub-steps (Completions → Progress → Dropped → Ratings, empty ones
//   skipped) rather than free-roaming tabs — consistent with the wizard's
//   own top-level "forward only" step model.
// Resolve-lists — three-column git-merge-style ordering resolution (see
//   ListMergeBoard) for whichever collections (and, in a later phase,
//   Ranking) the check found genuinely order-conflicting. Also a linear
//   sequence of sub-steps, one per touched collection.
// Committing — progress bar while batches are sent.
// Success — final report.
//
// Every one of those transitions is decided in useImportWizard; this file
// only picks which step's component to render.

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldConflictMerge } from './FieldConflictMerge'
import { ListMergeBoard } from './listMerge/ListMergeBoard'
import { ProgressBar, StepIndicator } from './WizardChrome'
import { UploadStep } from './UploadStep'
import { ReviewStep } from './ReviewStep'
import { SuccessStep } from './SuccessStep'
import {
  RANKING_MERGE_KEY,
  conflictsToGroups,
  ratingConflictsToGroups,
} from './importWizardModel'
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
  const {
    step,
    setStep,
    dateFormat,
    setDateFormat,
    handleParsed,
    parseResult,
    allFlags,
    handleSkipFlagged,
    blanketOverride,
    setBlanketOverride,
    conflictSubStep,
    completionConflicts,
    progressConflicts,
    droppedConflicts,
    ratingConflicts,
    handleCompletionConflictsResolved,
    handleProgressConflictsResolved,
    handleDroppedConflictsResolved,
    handleRatingConflictsResolved,
    handleConflictsCancelled,
    currentListMerge,
    handleListMergeConfirmed,
    handleListMergeCancelled,
    progress,
    progressLabel,
    commitError,
    backToReview,
    status,
  } = useImportWizard({ me, skipConflictCheck })

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

      {step === 'upload' && (
        <UploadStep
          dateFormat={dateFormat}
          onDateFormatChange={setDateFormat}
          onParsed={handleParsed}
        />
      )}

      {step === 'review' && parseResult && (
        <ReviewStep
          parseResult={parseResult}
          flags={allFlags}
          onSkipFlagged={handleSkipFlagged}
          onReUpload={() => setStep('upload')}
          showOverrideOption={!skipConflictCheck}
          blanketOverride={blanketOverride}
          onBlanketOverrideChange={setBlanketOverride}
        />
      )}

      {step === 'checking-conflicts' && (
        <div className="space-y-3 py-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking for conflicts…
          </div>
          {commitError && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-[var(--color-danger)]">
                {commitError}
              </p>
              <Button variant="outline" size="sm" onClick={backToReview}>
                Back to review
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'completions' && (
        <FieldConflictMerge
          tab="completion"
          groups={conflictsToGroups(completionConflicts)}
          onResolved={handleCompletionConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'progress' && (
        <FieldConflictMerge
          tab="progress"
          groups={conflictsToGroups(progressConflicts)}
          onResolved={handleProgressConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'dropped' && (
        <FieldConflictMerge
          tab="dropped"
          groups={conflictsToGroups(droppedConflicts)}
          onResolved={handleDroppedConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'ratings' && (
        <FieldConflictMerge
          tab="rating"
          groups={ratingConflictsToGroups(ratingConflicts)}
          onResolved={handleRatingConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-lists' && currentListMerge && (
        <ListMergeBoard
          key={currentListMerge.key}
          title={
            currentListMerge.key === RANKING_MERGE_KEY
              ? 'Ranking'
              : currentListMerge.key
          }
          mergedSeed={currentListMerge.merge.mergedSeed}
          importedRemainder={currentListMerge.merge.importedRemainder}
          existingRemainder={currentListMerge.merge.existingRemainder}
          importedOrder={currentListMerge.merge.importedOrder}
          existingOrder={currentListMerge.merge.existingOrder}
          onConfirm={handleListMergeConfirmed}
          onCancel={handleListMergeCancelled}
        />
      )}

      {step === 'committing' && (
        <div className="space-y-3 py-4">
          <ProgressBar value={progress} />
          <p className="text-sm text-muted-foreground text-center">
            {status?.status === 'running'
              ? `Importing… ${status.processedRows} / ${status.totalRows} rows`
              : progressLabel}
          </p>
          {commitError && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-[var(--color-danger)]">
                {commitError}
              </p>
              <Button variant="outline" size="sm" onClick={backToReview}>
                Back to review
              </Button>
            </div>
          )}
          {/* The job runs server-side once started — closing here doesn't
              cancel it; progress remains visible via the persistent toast and
              Settings. */}
          <div className="pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      {step === 'success' && status && (
        <SuccessStep status={status} onClose={onClose} />
      )}

      {/* resolve-conflicts/resolve-lists each have their own Cancel (back to
          review) inside FieldConflictMerge/ListMergeBoard — showing this
          generic one too would put two differently-behaving "Cancel"
          buttons next to each other. */}
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
