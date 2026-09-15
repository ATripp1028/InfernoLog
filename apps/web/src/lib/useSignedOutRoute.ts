import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouteGuard } from './useRouteGuard'

/**
 * Guards a page meant for signed-out visitors (sign in, sign up, password
 * reset): someone already signed in on arrival goes to their log instead.
 *
 * Decides once, when auth first finishes initializing, and then stops
 * watching. These pages sign the visitor in themselves partway through a flow
 * (a signup signs in before creating the account), and a guard that reacted to
 * that would yank them to /log mid-flow, before the page had finished routing
 * them to the right place.
 *
 * @returns Whether to render a placeholder instead of the page.
 */
export function useSignedOutRoute(): boolean {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const [signedInOnArrival, setSignedInOnArrival] = useState<boolean | null>(
    null
  )

  useEffect(() => {
    if (!isAuthInitializing && signedInOnArrival === null) {
      setSignedInOnArrival(isAuthenticated)
    }
  }, [isAuthInitializing, isAuthenticated, signedInOnArrival])

  return useRouteGuard({
    ready: signedInOnArrival !== null,
    when: signedInOnArrival === true,
    to: '/log',
  })
}
