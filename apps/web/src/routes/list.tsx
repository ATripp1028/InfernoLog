import { createFileRoute } from '@tanstack/react-router'
import { List } from '../pages/List'

export const Route = createFileRoute('/list')({
  component: List,
})
