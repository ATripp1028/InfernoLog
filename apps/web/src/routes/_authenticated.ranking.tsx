import { Ranking } from '@/pages/Ranking'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/ranking')({
  component: Ranking,
})
