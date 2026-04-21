import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAuthSession } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { getCurrentUser } from 'aws-amplify/auth'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    console.log('AuthCallback: setting up Hub listener')

    const unsubscribe = Hub.listen('auth', async ({ payload }) => {
      console.log('Hub auth event:', payload.event)

      if (payload.event === 'signedIn') {
        navigate('/list', { replace: true })
      }

      if (payload.event === 'signInWithRedirect_failure') {
        console.error('Hub: sign in failed', payload.data)
        navigate('/', { replace: true })
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