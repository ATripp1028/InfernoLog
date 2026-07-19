import { createFileRoute } from '@tanstack/react-router'
import { AcknowledgmentsPage } from '@/features/about/AcknowledgmentsPage'

export const Route = createFileRoute('/about')({
  component: AcknowledgmentsPage,
})
