import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { fetchAuthSession, signInWithRedirect, signOut, getCurrentUser } from 'aws-amplify/auth'

interface AuthUser {
  userId: string
  email: string
  name: string
  username: string
  onboardingCompleted: boolean
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: () => void
  signOut: () => void
  getIdToken: () => Promise<string>
  updateUser: (updates: Partial<AuthUser>) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
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
      const token = idToken?.toString()

      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const { data } = await res.json()
        setUser({
          userId: currentUser.userId,
          email: data.email,
          name: idToken?.payload.name as string,
          username: data.username,
          onboardingCompleted: data.onboardingCompleted,
        })
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const getIdToken = async (): Promise<string> => {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) throw new Error('No token available')
    return token
  }

  const updateUser = (updates: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...updates } : null)
  }

  const handleSignIn = () => signInWithRedirect({ provider: 'Google' })
  const handleSignOut = () => signOut()

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn: handleSignIn,
      signOut: handleSignOut,
      getIdToken,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}