import { ListMergeBoard } from '../listMerge/ListMergeBoard'
import { RANKING_MERGE_KEY } from '../importWizardModel'
import { useImportFlow } from '../ImportFlowProvider'

/**
 * Ordering resolution for whichever lists the check found genuinely
 * order-conflicting — one ListMergeBoard per touched collection (plus
 * the demon list), walked as a linear sub-sequence like the field-conflict step.
 *
 * Keyed on the current merge so moving to the next one remounts the board
 * rather than carrying the previous list's drag state into it.
 */
export function ResolveListsStep() {
  const {
    currentListMerge: current,
    handleListMergeConfirmed,
    handleListMergeCancelled,
  } = useImportFlow()

  if (!current) return null

  return (
    <ListMergeBoard
      key={current.key}
      title={current.key === RANKING_MERGE_KEY ? 'Demon List' : current.key}
      mergedSeed={current.merge.mergedSeed}
      importedRemainder={current.merge.importedRemainder}
      existingRemainder={current.merge.existingRemainder}
      importedOrder={current.merge.importedOrder}
      existingOrder={current.merge.existingOrder}
      onConfirm={handleListMergeConfirmed}
      onCancel={handleListMergeCancelled}
    />
  )
}
