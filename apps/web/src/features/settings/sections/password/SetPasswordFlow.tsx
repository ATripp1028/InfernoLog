import { Card } from '@/components/generic/card'
import type { MeData } from '@/lib/api/me'
import {
  SetPasswordFlowProvider,
  useSetPasswordFlow,
} from './SetPasswordFlowProvider'
import { CodeStep } from './steps/CodeStep'
import { DetailsStep } from './steps/DetailsStep'
import { ReconfirmStep } from './steps/ReconfirmStep'

/**
 * Adds a password to an account that signs in only with Google.
 */
export function SetPasswordFlow({ me }: { me: MeData }) {
  return (
    <SetPasswordFlowProvider me={me}>
      <Card className="p-4">
        <StepView />
      </Card>
    </SetPasswordFlowProvider>
  )
}

function StepView() {
  const { step } = useSetPasswordFlow()
  if (step === 'code') return <CodeStep />
  if (step === 'details') return <DetailsStep />
  return <ReconfirmStep />
}
