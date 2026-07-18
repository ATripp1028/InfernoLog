import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { LandingPage } from '@/features/landing/LandingPage'
import { PageLoading } from '@/components/PageLoading'
import { useAuth } from '@/context/AuthContext'

export const Route = createFileRoute('/')({
  component: IndexRoute,
})

// `/` is the unauthenticated marketing landing page. Authenticated users are
// sent straight to their List instead of seeing it.
function IndexRoute() {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const navigate = useNavigate()

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
