import { createFileRoute } from '@tanstack/react-router'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { PageLoading } from '@/components/shell/PageLoading'
import { useAuth } from '@/context/AuthContext'
import { useRouteGuard } from '@/lib/useRouteGuard'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const { isAuthenticated, isAuthInitializing } = useAuth()

  const blocked = useRouteGuard({
    ready: !isAuthInitializing,
    when: !isAuthenticated,
    to: '/',
  })

  if (blocked) {
    return <PageLoading />
  }

  return <OnboardingWizard />
}
