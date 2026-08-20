import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { EditModalShell } from './EditModalShell'
import { EditRunFields } from './EditRunFields'
import type { LevelPageData } from './types'
import { useEditRunModal } from './useEditRunModal'

interface EditRunModalProps {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  // The specific entry being edited — resolved by the caller (Timeline's
  // per-entry pencil, or the FAB's completion-first-else-newest default)
  // before opening. Null only while no entry is selected (dialog closed).
  progressUpdateId: string | null
}

/**
 * Edits one logged update. Completion-only fields appear only when the update is the completion.
 */
export function EditRunModal({
  open,
  onClose,
  data,
  levelId,
  scale,
  datePref,
  progressUpdateId,
}: EditRunModalProps) {
  const state = useEditRunModal({
    open,
    onClose,
    data,
    levelId,
    scale,
    datePref,
    progressUpdateId,
  })

  if (!state.ready) return null

  return (
    <EditModalShell
      open={open}
      onClose={onClose}
      title="Edit run"
      subtitle={`Editing ${state.entryLabel}`}
      onSave={state.handleSave}
      isSaving={state.isSaving}
      saveDisabled={state.hasFieldError}
    >
      <EditRunFields state={state} scale={scale} />
    </EditModalShell>
  )
}
