import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">InfernoLog</h1>
        <p className="text-sm text-muted-foreground">
          Track your Geometry Dash demon progress.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button onClick={signIn} size="lg" className="w-full">
          Sign In
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => navigate({ to: '/age-gate' })}
        >
          Sign Up
        </Button>
      </div>
    </div>
  )
}
