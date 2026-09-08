import { EditModalShell } from './EditModalShell'
import { EditLevelFields } from './EditLevelFields'
import type { LevelPageData } from '@/lib/api/levelPage'
import { useEditLevelModal } from './useEditLevelModal'

interface EditLevelModalProps {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
}

/**
 * Edits the level-scoped fields — the ones with one value per level rather than per logged event.
 */
export function EditLevelModal({
  open,
  onClose,
  data,
  levelId,
}: EditLevelModalProps) {
  const state = useEditLevelModal({ open, onClose, data, levelId })

  if (!state.ready) return null

  return (
    <EditModalShell
      open={open}
      onClose={onClose}
      title="Edit level details"
      subtitle={state.levelName}
      onSave={state.handleSave}
      isSaving={state.isSaving}
      saveDisabled={state.gddlTierError != null}
    >
      <EditLevelFields state={state} />
    </EditModalShell>
  )
}
