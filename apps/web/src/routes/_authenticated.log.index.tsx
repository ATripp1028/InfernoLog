import { createFileRoute } from '@tanstack/react-router'
import { Log } from '@/pages/Log'

export const Route = createFileRoute('/_authenticated/log/')({
  component: Log,
})
