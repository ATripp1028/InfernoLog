import { createFileRoute } from '@tanstack/react-router'
import dmcaPolicy from '../../../../legal/DMCA.md?raw'
import { LegalDocPage } from '@/components/LegalDocPage'

export const Route = createFileRoute('/dmca')({
  component: () => <LegalDocPage title="DMCA Policy" content={dmcaPolicy} />,
})
