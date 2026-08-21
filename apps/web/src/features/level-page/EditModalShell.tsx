import { Button } from '@/components/generic/button'
import { Modal } from '@/components/generic/modal'

interface EditModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: React.ReactNode
  /** Rendered between the header and the scrolling body — the tab strip. */
  belowHeader?: React.ReactNode
  children: React.ReactNode
  onSave: () => void
  isSaving: boolean
  saveDisabled: boolean
}

/**
 * `Modal` with the Cancel/Save footer the three edit modals share.
 *
 * That footer, and the `onSave`/`isSaving`/`saveDisabled` contract behind it,
 * is the only thing this adds — everything else is Modal's. It stays a
 * separate component so the footer lives in one place rather than being
 * retyped in each of the three.
 *
 * While `isSaving` the modal can't be dismissed at all: Escape, the overlay,
 * the X and Cancel are all inert, so a save in flight can't be orphaned by a
 * stray click. The X and Cancel fade out to say so.
 */
export function EditModalShell({
  open,
  onClose,
  title,
  subtitle,
  belowHeader,
  children,
  onSave,
  isSaving,
  saveDisabled,
}: EditModalShellProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSaving}
      title={title}
      subtitle={subtitle}
      belowHeader={belowHeader}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving || saveDisabled}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 px-5 pb-2 pt-1">
        {children}
        <div className="h-2" />
      </div>
    </Modal>
  )
}
