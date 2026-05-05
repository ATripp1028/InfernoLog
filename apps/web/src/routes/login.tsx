import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Login } from '@/pages/Login'
import { useAuth } from '@/context/AuthContext'

export const Route = createFileRoute('/login')({
  component: LoginRoute,
})

function LoginRoute() {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthInitializing && isAuthenticated) {
      navigate({ to: '/list', replace: true })
    }
  }, [isAuthInitializing, isAuthenticated, navigate])

  return <Login />
}
