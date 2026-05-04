import { createFileRoute } from '@tanstack/react-router'
import { List } from '@/pages/List'

export const Route = createFileRoute('/_authenticated/list')({
  component: List,
})
