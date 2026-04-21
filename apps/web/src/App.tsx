import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AuthCallback } from './pages/AuthCallback'
import { Onboarding } from './pages/Onboarding'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  )
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
    <Routes>
      {/* Onboarding gate — redirect to onboarding if not completed */}
      <Route
        path="/onboarding"
        element={
          user.onboardingCompleted
            ? <Navigate to="/list" replace />
            : <Onboarding />
        }
      />

      {/* Protected routes — redirect to onboarding if not completed */}
      <Route
        path="/list"
        element={
          user.onboardingCompleted
            ? <div style={{ padding: '24px' }}><h1>The List</h1><p>Welcome, {user.username}</p><button onClick={signOut}>Sign out</button></div>
            : <Navigate to="/onboarding" replace />
        }
      />

      {/* Default redirect */}
      <Route
        path="*"
        element={
          user.onboardingCompleted
            ? <Navigate to="/list" replace />
            : <Navigate to="/onboarding" replace />
        }
      />
    </Routes>
  )
}