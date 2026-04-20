import { useAuth } from './hooks/useAuth'
import { AuthCallback } from './pages/AuthCallback'

export default function App() {
  // Handle auth callback before anything else
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const { user, loading, signIn, signOut } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px' }}>
        <h1>InfernoLog</h1>
        <button onClick={signIn}>Sign in with Google</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1>InfernoLog</h1>
      <p>Welcome, {user.name}</p>
      <p>Email: {user.email}</p>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}