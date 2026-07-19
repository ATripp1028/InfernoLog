import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { useAuth } from '@/context/AuthContext'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthInitializing && !isAuthenticated) {
      navigate({ to: '/', replace: true })
    }
  }, [isAuthInitializing, isAuthenticated, navigate])

  return <OnboardingWizard />
}
