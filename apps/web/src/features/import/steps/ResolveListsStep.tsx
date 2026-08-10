// Ordering resolution for whichever lists the check found genuinely
// order-conflicting — one ListMergeBoard per touched collection (plus
// Ranking), walked as a linear sub-sequence like the field-conflict step.
//
// Keyed on the current merge so moving to the next one remounts the board
// rather than carrying the previous list's drag state into it.

import { ListMergeBoard } from '../listMerge/ListMergeBoard'
import { RANKING_MERGE_KEY } from '../importWizardModel'
import type { ImportListMerge } from '@/lib/api/import'

export function ResolveListsStep({
  current,
  onConfirm,
  onCancel,
}: {
  // Collection display name (or RANKING_MERGE_KEY) plus the merge to resolve.
  current: { key: string; merge: ImportListMerge }
  onConfirm: (finalOrder: string[]) => void
  onCancel: () => void
}) {
  return (
    <ListMergeBoard
      key={current.key}
      title={current.key === RANKING_MERGE_KEY ? 'Ranking' : current.key}
      mergedSeed={current.merge.mergedSeed}
      importedRemainder={current.merge.importedRemainder}
      existingRemainder={current.merge.existingRemainder}
      importedOrder={current.merge.importedOrder}
      existingOrder={current.merge.existingOrder}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
