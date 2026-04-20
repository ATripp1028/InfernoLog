import { useState, useEffect } from 'react'
import { fetchAuthSession, signInWithRedirect, signOut, getCurrentUser } from 'aws-amplify/auth'

interface AuthUser {
  userId: string
  email: string
  name: string
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser()
      const session = await fetchAuthSession()
      const idToken = session.tokens?.idToken
      
      setUser({
        userId: currentUser.userId,
        email: idToken?.payload.email as string,
        name: idToken?.payload.name as string,
      })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = () => signInWithRedirect({ provider: 'Google' })
  
  const handleSignOut = () => signOut()

  return { user, loading, signIn, signOut: handleSignOut }
}