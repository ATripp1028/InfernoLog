import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AuthCallback } from './pages/AuthCallback'
import { Onboarding } from './pages/Onboarding'
import { UnauthenticatedRoutes } from './UnauthenticatedRoutes'
import { AuthenticatedRoutes } from './AuthenticatedRoutes'

export default function App() {
  const { user, loading } = useAuth()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<UnauthenticatedRoutes />} />
        <Route path="/*" element={<RootApp />} />
      </Routes>
    </BrowserRouter>
  )
}

function RootApp() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Navigate to="/login" replace />
    )
  }

  if (!user.onboardingCompleted) {
    return (
      <Navigate to="/onboarding" replace />
    )
  }

  return (
    <AuthenticatedRoutes />
  )
}