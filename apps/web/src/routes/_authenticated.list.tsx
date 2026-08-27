import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Redirect for the Log page's previous URL.
 *
 * `/ranking` deliberately gets no equivalent: it is about to become the
 * rating-ordered Ranking page, so a redirect there would collide with a real
 * destination rather than rescue a stale bookmark.
 */
export const Route = createFileRoute('/_authenticated/list')({
  beforeLoad: () => {
    throw redirect({ to: '/log', replace: true })
  },
})
