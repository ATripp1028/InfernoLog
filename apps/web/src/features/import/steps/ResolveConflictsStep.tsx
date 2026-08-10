// Field-level conflict resolution. One FieldConflictMerge per tab, walked as
// a linear sub-sequence (Completions → Progress → Dropped → Ratings, empty
// ones skipped) rather than free-roaming tabs — consistent with the wizard's
// own forward-only step model.
//
// Which sub-step is current, and what "resolved" advances to, are decided in
// useImportWizard; this only maps the sub-step to its resolver.

import { FieldConflictMerge } from '../FieldConflictMerge'
import type { GroupResolution } from '../FieldConflictMerge'
import type { ImportRatingConflict, ImportRowConflict } from '@/lib/api/import'
import {
  conflictsToGroups,
  ratingConflictsToGroups,
  type ConflictSubStep,
} from '../importWizardModel'

export function ResolveConflictsStep({
  subStep,
  completionConflicts,
  progressConflicts,
  droppedConflicts,
  ratingConflicts,
  onCompletionsResolved,
  onProgressResolved,
  onDroppedResolved,
  onRatingsResolved,
  onCancel,
}: {
  subStep: ConflictSubStep
  completionConflicts: ImportRowConflict[]
  progressConflicts: ImportRowConflict[]
  droppedConflicts: ImportRowConflict[]
  ratingConflicts: ImportRatingConflict[]
  onCompletionsResolved: (resolved: Map<string, GroupResolution>) => void
  onProgressResolved: (resolved: Map<string, GroupResolution>) => void
  onDroppedResolved: (resolved: Map<string, GroupResolution>) => void
  onRatingsResolved: (resolved: Map<string, GroupResolution>) => void
  onCancel: () => void
}) {
  switch (subStep) {
    case 'completions':
      return (
        <FieldConflictMerge
          tab="completion"
          groups={conflictsToGroups(completionConflicts)}
          onResolved={onCompletionsResolved}
          onCancel={onCancel}
        />
      )
    case 'progress':
      return (
        <FieldConflictMerge
          tab="progress"
          groups={conflictsToGroups(progressConflicts)}
          onResolved={onProgressResolved}
          onCancel={onCancel}
        />
      )
    case 'dropped':
      return (
        <FieldConflictMerge
          tab="dropped"
          groups={conflictsToGroups(droppedConflicts)}
          onResolved={onDroppedResolved}
          onCancel={onCancel}
        />
      )
    case 'ratings':
      return (
        <FieldConflictMerge
          tab="rating"
          groups={ratingConflictsToGroups(ratingConflicts)}
          onResolved={onRatingsResolved}
          onCancel={onCancel}
        />
      )
  }
}
