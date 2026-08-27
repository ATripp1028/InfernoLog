import { DemonList } from '@/pages/DemonList'
import { createFileRoute } from '@tanstack/react-router'

/**
 * `?place=<levelProgressId>` is set by the post-completion "Place now" handoff
 * so the page can highlight + scroll to the freshly logged level.
 */
export interface DemonListSearch {
  place?: string | undefined
}

export const Route = createFileRoute('/_authenticated/demon-list')({
  component: DemonList,
  validateSearch: (search: Record<string, unknown>): DemonListSearch => ({
    place: typeof search.place === 'string' ? search.place : undefined,
  }),
})
