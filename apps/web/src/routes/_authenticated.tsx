import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Shell } from '@/components/Shell'
import { PageLoading } from '@/components/PageLoading'
import { useAuth } from '@/context/AuthContext'
import { useMe } from '@/lib/api/me'
import { LoggingFlowProvider } from '@/features/logging/LoggingFlowProvider'

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
    if (
      !isAuthInitializing &&
      isAuthenticated &&
      me.data &&
      !me.data.onboardingCompleted
    ) {
      navigate({ to: '/onboarding', replace: true })
    }
  }, [isAuthInitializing, isAuthenticated, me.data, navigate])

  if (isAuthInitializing || !isAuthenticated) {
    return <PageLoading />
  }

  if (me.isPending) {
    return <PageLoading />
  }

  if (me.error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-red-500">
          Something went wrong. Please refresh the page.
        </p>
      </div>
    )
  }

  if (!me.data?.onboardingCompleted) {
    return <PageLoading />
  }

  return (
    <LoggingFlowProvider>
      <Shell>
        <Outlet />
      </Shell>
    </LoggingFlowProvider>
  )
}
