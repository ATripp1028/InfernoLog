import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Hub } from 'aws-amplify/utils'
import { useAuth } from '../context/AuthContext'

export function AuthCallback() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  // Amplify can emit `signedIn` before this component mounts (during its
  // redirect-handling on app init), so a Hub listener alone races and gets
  // stuck. Once AuthContext has loaded a user, we know auth succeeded.
  useEffect(() => {
    if (!loading && user) {
      navigate({ to: '/list', replace: true })
    }
  }, [loading, user, navigate])

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        navigate({ to: '/list', replace: true })
      }
      if (payload.event === 'signInWithRedirect_failure') {
        console.error('Hub: sign in failed', payload.data)
        navigate({ to: '/', replace: true })
      }
    })

    return () => unsubscribe()
  }, [navigate])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing you in...</p>
    </div>
  )
}
