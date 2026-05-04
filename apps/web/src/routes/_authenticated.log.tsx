import { Log } from '@/pages/Log'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/log')({
  component: Log,
})