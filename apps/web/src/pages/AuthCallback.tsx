import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Hub } from 'aws-amplify/utils'
import { decodeJWT, fetchAuthSession } from 'aws-amplify/auth'
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito'
import { useAuth } from '../context/AuthContext'

export function AuthCallback() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const handledFragment = useRef(false)

  // Discord flow: backend redirects here with tokens in the URL fragment.
  // Inject them into Amplify's token store so the rest of the app sees a
  // logged-in session.
  useEffect(() => {
    if (handledFragment.current) return
    if (typeof window === 'undefined') return
    if (!window.location.hash) return

    const params = new URLSearchParams(window.location.hash.slice(1))
    const idToken = params.get('id_token')
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!idToken || !accessToken || !refreshToken) return

    handledFragment.current = true
    const decodedId = decodeJWT(idToken)
    const username = decodedId.payload['cognito:username'] as string | undefined
    if (!username) {
      console.error('Discord callback: id_token missing cognito:username')
      navigate({ to: '/', replace: true })
      return
    }

    void (async () => {
      try {
        await cognitoUserPoolsTokenProvider.tokenOrchestrator.setTokens({
          tokens: {
            idToken: decodedId,
            accessToken: decodeJWT(accessToken),
            refreshToken,
            clockDrift: 0,
            username,
          },
        })
        // Strip tokens from the URL before they hit history.
        window.history.replaceState({}, '', window.location.pathname)
        await fetchAuthSession()
        // setTokens() bypasses the Hub event Amplify normally fires on
        // sign-in, so emit it ourselves to wake up AuthContext.
        Hub.dispatch('auth', { event: 'signedIn' })
        navigatePostSignIn()
      } catch (err) {
        console.error('Discord callback: failed to set tokens', err)
        navigate({ to: '/', replace: true })
      }
    })()
  }, [navigate])

  // After any successful sign-in, if there's a pending Discord link, resume
  // that flow instead of going to /list.
  const navigatePostSignIn = () => {
    const pendingLinkToken = sessionStorage.getItem('pendingDiscordLinkToken')
    if (pendingLinkToken) {
      sessionStorage.removeItem('pendingDiscordLinkToken')
      navigate({
        to: '/auth/link-discord',
        search: { token: pendingLinkToken },
        replace: true,
      })
      return
    }
    navigate({ to: '/list', replace: true })
  }

  // Existing Google flow (Amplify-managed).
  useEffect(() => {
    if (handledFragment.current) return
    if (isAuthenticated) {
      navigatePostSignIn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        navigatePostSignIn()
      }
      if (payload.event === 'signInWithRedirect_failure') {
        console.error('Hub: sign in failed', payload.data)
        navigate({ to: '/', replace: true })
      }
    })

    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing you in...</p>
    </div>
  )
}
