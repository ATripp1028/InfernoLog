import { createFileRoute } from '@tanstack/react-router'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { PageLoading } from '@/components/shell/PageLoading'
import { useAuth } from '@/context/AuthContext'
import { useRouteGuard } from '@/lib/useRouteGuard'
import { GddlSyncProvider } from '@/features/settings/GddlSyncProvider'

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

  // The wizard's last step renders GddlApiKeyEditor, which reads
  // GddlSyncContext — and this route is NOT under `_authenticated`, so it does
  // not inherit that layout's provider. Without this the GDDL step throws and
  // the user can never reach Finish. Mounting it here also means a sync
  // started during onboarding gets the same completion toast and cache
  // invalidation it would from Settings.
  return (
    <GddlSyncProvider>
      <OnboardingWizard />
    </GddlSyncProvider>
  )
}
