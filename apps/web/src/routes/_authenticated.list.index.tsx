import { createFileRoute, redirect } from '@tanstack/react-router'

/** `/list` → `/log`. See `_authenticated.list.tsx`. */
export const Route = createFileRoute('/_authenticated/list/')({
  beforeLoad: () => {
    throw redirect({ to: '/log', replace: true })
  },
})
