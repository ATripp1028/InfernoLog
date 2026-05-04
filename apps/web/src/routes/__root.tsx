import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Loading } from '../pages/Loading'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isAuthCallback = location.pathname === '/auth/callback'

  useEffect(() => {
    if (loading || isAuthCallback) return

    if (!user) {
      if (location.pathname !== '/login') {
        navigate({ to: '/login', replace: true })
      }
      return
    }

    if (!user.onboardingCompleted) {
      if (location.pathname !== '/onboarding') {
        navigate({ to: '/onboarding', replace: true })
      }
      return
    }

    if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/onboarding') {
      navigate({ to: '/list', replace: true })
    }
  }, [user, loading, isAuthCallback, location.pathname, navigate])

  if (isAuthCallback) {
    return <Outlet />
  }

  if (loading) {
    return <Loading />
  }

  return <Outlet />
}
