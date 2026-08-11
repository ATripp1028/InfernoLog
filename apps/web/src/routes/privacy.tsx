import { createFileRoute } from '@tanstack/react-router'
import privacyPolicy from '../../../../legal/PRIVACY_POLICY.md?raw'
import { LegalDocPage } from '@/components/public/LegalDocPage'

export const Route = createFileRoute('/privacy')({
  component: () => (
    <LegalDocPage title="Privacy Policy" content={privacyPolicy} />
  ),
})
