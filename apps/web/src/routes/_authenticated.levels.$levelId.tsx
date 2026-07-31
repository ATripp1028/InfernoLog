import { createFileRoute } from '@tanstack/react-router'
import { GlobalLevelPage } from '@/pages/GlobalLevelPage'

export const Route = createFileRoute('/_authenticated/levels/$levelId')({
  component: GlobalLevelPage,
})
