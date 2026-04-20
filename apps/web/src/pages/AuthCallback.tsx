import { useEffect } from 'react'

export function AuthCallback() {
  useEffect(() => {
    // Amplify handles the token exchange automatically
    // Just redirect to the main app after a brief moment
    setTimeout(() => {
      window.location.href = '/list'
    }, 1000)
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing you in...</p>
    </div>
  )
}