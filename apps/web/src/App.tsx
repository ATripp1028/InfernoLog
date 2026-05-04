import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AuthCallback } from './pages/AuthCallback'
import { Onboarding } from './pages/Onboarding'
import { UnauthenticatedRoutes } from './UnauthenticatedRoutes'
import { AuthenticatedRoutes } from './AuthenticatedRoutes'
import { Loading } from './pages/Loading'

export default function App() {
  const { user, loading } = useAuth()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/*" element={<RootApp />} />
      </Routes>
    </BrowserRouter>
  )
}

function RootApp() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <Loading />
    )
  }

  if (!user) {
    return (
      <UnauthenticatedRoutes />
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