import { Modal } from '@/components/generic/modal'
import type { MeData } from '@/lib/api/me'
import {
  ChangeEmailFlowProvider,
  useChangeEmailFlow,
} from './ChangeEmailFlowProvider'
import { EmailCodeStep } from './steps/EmailCodeStep'
import { EmailDetailsStep } from './steps/EmailDetailsStep'

/**
 * The change-email dialog.
 */
export function ChangeEmailDialog({
  me,
  onClose,
}: {
  me: MeData
  onClose: () => void
}) {
  return (
    <ChangeEmailFlowProvider me={me} onClose={onClose}>
      <Shell />
    </ChangeEmailFlowProvider>
  )
}

function Shell() {
  const { step, pending, close } = useChangeEmailFlow()
  return (
    <Modal
      open
      onClose={close}
      busy={pending}
      size="sm"
      title="Change email"
      subtitle={
        step === 'code'
          ? 'Enter the code we sent to your new address.'
          : 'Your new address becomes how you sign in and recover your account.'
      }
    >
      <div className="px-5 pb-5">
        {step === 'code' ? <EmailCodeStep /> : <EmailDetailsStep />}
      </div>
    </Modal>
  )
}
