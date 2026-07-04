import { createFileRoute } from '@tanstack/react-router'
import { Collections } from '@/pages/Collections'

export const Route = createFileRoute('/_authenticated/collections/')({
  component: Collections,
})
