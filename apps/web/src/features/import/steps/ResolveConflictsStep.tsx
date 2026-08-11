import { FieldConflictMerge } from '../FieldConflictMerge'
import {
  conflictsToGroups,
  ratingConflictsToGroups,
} from '../importWizardModel'
import { useImportFlow } from '../ImportFlowProvider'

/**
 * Field-level conflict resolution. One FieldConflictMerge per tab, walked as
 * a linear sub-sequence (Completions → Progress → Dropped → Ratings, empty
 * ones skipped) rather than free-roaming tabs — consistent with the wizard's
 * own forward-only step model.
 *
 * Which sub-step is current, and what "resolved" advances to, are decided in
 * useImportWizard; this only maps the sub-step to its resolver.
 */
export function ResolveConflictsStep() {
  const {
    conflictSubStep,
    completionConflicts,
    progressConflicts,
    droppedConflicts,
    ratingConflicts,
    handleCompletionConflictsResolved,
    handleProgressConflictsResolved,
    handleDroppedConflictsResolved,
    handleRatingConflictsResolved,
    handleConflictsCancelled: onCancel,
  } = useImportFlow()

  switch (conflictSubStep) {
    case 'completions':
      return (
        <FieldConflictMerge
          tab="completion"
          groups={conflictsToGroups(completionConflicts)}
          onResolved={handleCompletionConflictsResolved}
          onCancel={onCancel}
        />
      )
    case 'progress':
      return (
        <FieldConflictMerge
          tab="progress"
          groups={conflictsToGroups(progressConflicts)}
          onResolved={handleProgressConflictsResolved}
          onCancel={onCancel}
        />
      )
    case 'dropped':
      return (
        <FieldConflictMerge
          tab="dropped"
          groups={conflictsToGroups(droppedConflicts)}
          onResolved={handleDroppedConflictsResolved}
          onCancel={onCancel}
        />
      )
    case 'ratings':
      return (
        <FieldConflictMerge
          tab="rating"
          groups={ratingConflictsToGroups(ratingConflicts)}
          onResolved={handleRatingConflictsResolved}
          onCancel={onCancel}
        />
      )
  }
}
