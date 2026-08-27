import { createFileRoute, Outlet } from '@tanstack/react-router'

/**
 * Redirects for the Log page's previous URLs — the layout itself only renders
 * its children; each child route does the redirecting, so `/list/$levelId`
 * keeps its level id instead of being flattened onto `/log` by a redirect
 * declared here (a parent `beforeLoad` runs for every child too).
 *
 * `/ranking` deliberately gets no equivalent: it is about to become the
 * rating-ordered Ranking page, so a redirect there would collide with a real
 * destination rather than rescue a stale bookmark.
 */
export const Route = createFileRoute('/_authenticated/list')({
  component: () => <Outlet />,
})
