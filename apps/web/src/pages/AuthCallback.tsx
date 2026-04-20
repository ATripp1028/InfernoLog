import { useEffect } from 'react'
import { Hub } from 'aws-amplify/utils'
import { getCurrentUser } from 'aws-amplify/auth'

export function AuthCallback() {
  useEffect(() => {
    console.log('AuthCallback: setting up Hub listener')
    console.log('Current URL:', window.location.href)

    const unsubscribe = Hub.listen('auth', async ({ payload }) => {
      console.log('Hub auth event:', payload.event)
      
      if (payload.event === 'signedIn') {
        console.log('Hub: user signed in')
        try {
          const user = await getCurrentUser()
          console.log('Hub: got user', user)
          window.location.href = '/list'
        } catch (error) {
          console.error('Hub: error getting user', error)
          window.location.href = '/'
        }
      }

      if (payload.event === 'signInWithRedirect_failure') {
        console.error('Hub: sign in failed', payload.data)
        window.location.href = '/'
      }
    })

    // Cleanup listener on unmount
    return () => unsubscribe()
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing you in...</p>
    </div>
  )
}