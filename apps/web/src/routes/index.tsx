import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { LandingPage } from '@/features/landing/LandingPage'
import { PageLoading } from '@/components/PageLoading'
import { useAuth, NO_ACCOUNT_FOUND_KEY } from '@/context/AuthContext'
import { useRouteGuard } from '@/lib/useRouteGuard'

export const Route = createFileRoute('/')({
  component: IndexRoute,
})

// `/` is the unauthenticated marketing landing page. Authenticated users are
// sent straight to their List instead of seeing it.
function IndexRoute() {
  const { isAuthenticated, isAuthInitializing } = useAuth()

  // Landing here after a signOut() triggered by AuthCallback's rejected
  // sign-in: that signOut goes through Cognito's hosted-UI logout redirect,
  // which always lands back on this root route (a real page navigation, not
  // a SPA route change) rather than wherever AuthCallback tried to
  // `navigate` to. Captured once at mount so it stays true for the rest of
  // this component's life even after the effect below clears the key.
  const [awaitingNoAccountFoundRedirect] = useState(
    () => sessionStorage.getItem(NO_ACCOUNT_FOUND_KEY) !== null
  )
  useEffect(() => {
    if (awaitingNoAccountFoundRedirect) {
      sessionStorage.removeItem(NO_ACCOUNT_FOUND_KEY)
    }
  }, [awaitingNoAccountFoundRedirect])

  const blockedByNoAccountFound = useRouteGuard({
    ready: true,
    when: awaitingNoAccountFoundRedirect,
    to: '/no-account-found',
  })
  const blockedByAuth = useRouteGuard({
    ready: !isAuthInitializing,
    when: isAuthenticated,
    to: '/list',
  })

  if (blockedByNoAccountFound || blockedByAuth) {
    return <PageLoading />
  }

  return <LandingPage />
}
