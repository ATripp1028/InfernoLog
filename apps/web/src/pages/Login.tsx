import { useAuth } from '../context/AuthContext'

export function Login() {
  const { signIn, signInWithDiscord } = useAuth()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px' }}>
      <h1>InfernoLog</h1>
      <button onClick={signIn}>Sign in with Google</button>
      <button onClick={() => { void signInWithDiscord() }}>Sign in with Discord</button>
    </div>
  )
}