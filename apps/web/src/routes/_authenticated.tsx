import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Shell } from '@/components/Shell'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}
