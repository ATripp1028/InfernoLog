import { createFileRoute } from '@tanstack/react-router'
import { NoAccountFound } from '@/pages/NoAccountFound'

export const Route = createFileRoute('/no-account-found')({
  component: NoAccountFound,
})
