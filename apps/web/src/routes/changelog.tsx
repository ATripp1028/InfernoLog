import { createFileRoute } from '@tanstack/react-router'
import changelog from '../../../../CHANGELOG.md?raw'
import { LegalDocPage } from '@/components/public/LegalDocPage'

export const Route = createFileRoute('/changelog')({
  component: () => <LegalDocPage title="Changelog" content={changelog} />,
})
