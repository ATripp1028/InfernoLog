import { createFileRoute } from '@tanstack/react-router'
import { PageLoading } from '@/components/shell/PageLoading'
import { SignUpPage } from '@/features/auth/signup/SignUpPage'
import { hasPassedAgeGate } from '@/lib/ageGate'
import { useRouteGuard } from '@/lib/useRouteGuard'
import { useSignedOutRoute } from '@/lib/useSignedOutRoute'

export const Route = createFileRoute('/signup')({
  component: SignUpRoute,
})

// Signup is only reachable through the age gate (COPPA: the gate runs before
// anything about a would-be user is collected). A direct visit, or a new tab,
// goes back through it. UX only, like the gate itself — see lib/ageGate.ts.
function SignUpRoute() {
  const blockedBySession = useSignedOutRoute()
  const blockedByAgeGate = useRouteGuard({
    ready: true,
    when: !hasPassedAgeGate(),
    to: '/age-gate',
  })
  if (blockedBySession || blockedByAgeGate) return <PageLoading />
  return <SignUpPage />
}
