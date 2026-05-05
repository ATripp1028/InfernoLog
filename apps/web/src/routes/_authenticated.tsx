import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Shell } from '@/components/Shell'
import { PageLoading } from '@/components/PageLoading'
import { useAuth } from '@/context/AuthContext'
import { useMe } from '@/lib/api/me'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const navigate = useNavigate()
  const me = useMe()

  useEffect(() => {
    if (!isAuthInitializing && !isAuthenticated) {
      navigate({ to: '/login', replace: true })
    }
  }, [isAuthInitializing, isAuthenticated, navigate])

  useEffect(() => {
    if (me.data && !me.data.onboardingCompleted) {
      navigate({ to: '/onboarding', replace: true })
    }
  }, [me.data, navigate])

  if (isAuthInitializing || !isAuthenticated || me.isPending || !me.data?.onboardingCompleted) {
    return <PageLoading />
  }

  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}
