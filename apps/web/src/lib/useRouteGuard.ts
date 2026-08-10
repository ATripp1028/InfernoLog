import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { FileRouteTypes } from '@/routeTree.gen'

type NavigateTo = FileRouteTypes['to']

/**
 * Every route that gates on async state (auth, onboarding status, a one-shot
 * sessionStorage flag) needs the same two things: redirect away once the
 * condition is known to hold, and don't render the real page in the meantime
 * — otherwise the page flashes for a frame before the redirect lands. Doing
 * this ad hoc per-route is easy to get half right (see: the no-account-found
 * redirect, which redirected but forgot to also gate the render). This hook
 * is the one place that logic lives.
 *
 * `ready` means "we know enough to decide" — before that, `when` is
 * meaningless and must not be trusted either way.
 */
export function useRouteGuard({
  ready,
  when,
  to,
}: {
  ready: boolean
  when: boolean
  to: NavigateTo
}): boolean {
  const navigate = useNavigate()
  const shouldRedirect = ready && when

  useEffect(() => {
    if (shouldRedirect) navigate({ to, replace: true })
  }, [shouldRedirect, to, navigate])

  return !ready || shouldRedirect
}
