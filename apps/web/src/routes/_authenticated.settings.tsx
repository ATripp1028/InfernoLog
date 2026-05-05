import { Settings } from '@/pages/Settings'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/settings')({
  component: Settings,
})