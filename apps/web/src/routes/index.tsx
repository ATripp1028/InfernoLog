import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/features/landing/LandingPage'
import { PageLoading } from '@/components/shell/PageLoading'
import { useAuth } from '@/context/AuthContext'
import { useRouteGuard } from '@/lib/useRouteGuard'

export const Route = createFileRoute('/')({
  component: IndexRoute,
})

// `/` is the unauthenticated marketing landing page. Authenticated users are
// sent straight to their List instead of seeing it.
function IndexRoute() {
  const { isAuthenticated, isAuthInitializing } = useAuth()

  const blockedByAuth = useRouteGuard({
    ready: !isAuthInitializing,
    when: isAuthenticated,
    to: '/log',
  })

  if (blockedByAuth) {
    return <PageLoading />
  }

  return <LandingPage />
}
