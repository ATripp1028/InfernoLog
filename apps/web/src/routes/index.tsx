import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { LandingPage } from '@/features/landing/LandingPage'
import { PageLoading } from '@/components/PageLoading'
import { useAuth, NO_ACCOUNT_FOUND_KEY } from '@/context/AuthContext'

export const Route = createFileRoute('/')({
  component: IndexRoute,
})

// `/` is the unauthenticated marketing landing page. Authenticated users are
// sent straight to their List instead of seeing it.
function IndexRoute() {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const navigate = useNavigate()

  // Landing here after a signOut() triggered by AuthCallback's rejected
  // sign-in: that signOut goes through Cognito's hosted-UI logout redirect,
  // which always lands back on this root route (a real page navigation, not
  // a SPA route change) rather than wherever AuthCallback tried to `navigate`
  // to. Pick the trip back up and forward to /no-account-found.
  useEffect(() => {
    if (sessionStorage.getItem(NO_ACCOUNT_FOUND_KEY)) {
      sessionStorage.removeItem(NO_ACCOUNT_FOUND_KEY)
      navigate({ to: '/no-account-found', replace: true })
    }
  }, [navigate])

  useEffect(() => {
    if (!isAuthInitializing && isAuthenticated) {
      navigate({ to: '/list', replace: true })
    }
  }, [isAuthInitializing, isAuthenticated, navigate])

  if (isAuthInitializing || isAuthenticated) {
    return <PageLoading />
  }

  return <LandingPage />
}
