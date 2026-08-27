import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/list/$levelId` → `/log/$levelId`.
 *
 * The level page is the most-shared URL in the app, so a stale link has to
 * land on the level rather than on the top of the Log.
 */
export const Route = createFileRoute('/_authenticated/list/$levelId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/log/$levelId',
      params: { levelId: params.levelId },
      replace: true,
    })
  },
})
