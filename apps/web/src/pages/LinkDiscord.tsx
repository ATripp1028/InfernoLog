import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../context/AuthContext'

type Status = 'idle' | 'linking' | 'success' | 'error'

export function LinkDiscord({ token }: { token: string }) {
  const { isAuthenticated, isAuthInitializing, signIn, getIdToken } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const linkAttempted = useRef(false)

  // Once the user signs in (with their existing method), POST the link token.
  useEffect(() => {
    if (!isAuthenticated || linkAttempted.current || !token) return
    linkAttempted.current = true

    void (async () => {
      setStatus('linking')
      try {
        const idToken = await getIdToken()
        const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/me/link-discord`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          setErrorMessage(body?.error ?? `Failed to link Discord (HTTP ${res.status})`)
          setStatus('error')
          return
        }
        setStatus('success')
        setTimeout(() => navigate({ to: '/list', replace: true }), 800)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
      }
    })()
  }, [isAuthenticated, token, getIdToken, navigate])

  if (isAuthInitializing) {
    return (
      <Container>
        <p>Loading…</p>
      </Container>
    )
  }

  if (!isAuthenticated) {
    const handleSignInForLinking = () => {
      // Survive the Cognito hosted-UI round-trip: AuthCallback reads this
      // back and redirects here with the token preserved.
      sessionStorage.setItem('pendingDiscordLinkToken', token)
      signIn()
    }
    return (
      <Container>
        <h1>Link Discord to your account</h1>
        <p style={{ maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
          An InfernoLog account already exists with the email on your Discord account.
          To link your Discord, please first sign in with your existing method below.
          Once signed in, we&apos;ll connect your Discord automatically.
        </p>
        <button onClick={handleSignInForLinking}>Sign in with Google</button>
      </Container>
    )
  }

  if (status === 'linking') {
    return (
      <Container>
        <p>Linking your Discord account…</p>
      </Container>
    )
  }

  if (status === 'success') {
    return (
      <Container>
        <p>Discord linked. Redirecting…</p>
      </Container>
    )
  }

  if (status === 'error') {
    return (
      <Container>
        <h1>Couldn&apos;t link Discord</h1>
        <p style={{ color: '#c33', maxWidth: 480, textAlign: 'center' }}>{errorMessage}</p>
        <button onClick={() => navigate({ to: '/', replace: true })}>Back to home</button>
      </Container>
    )
  }

  return (
    <Container>
      <p>Preparing…</p>
    </Container>
  )
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: 16,
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}
