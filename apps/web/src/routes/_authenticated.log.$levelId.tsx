import { createFileRoute } from '@tanstack/react-router'
import { LevelPage } from '@/pages/LevelPage'

export const Route = createFileRoute('/_authenticated/log/$levelId')({
  component: LevelPage,
})
