import { Ranking } from '@/pages/Ranking'
import { createFileRoute } from '@tanstack/react-router'

// `?place=<levelProgressId>` is set by the post-completion "Place now" handoff
// so the page can highlight + scroll to the freshly logged level.
export interface RankingSearch {
  place?: string | undefined
}

export const Route = createFileRoute('/_authenticated/ranking')({
  component: Ranking,
  validateSearch: (search: Record<string, unknown>): RankingSearch => ({
    place: typeof search.place === 'string' ? search.place : undefined,
  }),
})