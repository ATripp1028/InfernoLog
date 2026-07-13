import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NoAccountFound() {
  const navigate = useNavigate()

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-semibold">No account found</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        We couldn't find an InfernoLog account for that Google sign-in. Sign up
        instead to create one.
      </p>
      <Button onClick={() => navigate({ to: '/age-gate' })}>Sign Up</Button>
    </div>
  )
}
