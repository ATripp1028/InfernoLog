import { createFileRoute } from '@tanstack/react-router'
import { PageLoading } from '@/components/shell/PageLoading'
import { SignInPage } from '@/features/auth/signin/SignInPage'
import { useSignedOutRoute } from '@/lib/useSignedOutRoute'

export const Route = createFileRoute('/signin')({
  component: SignInRoute,
})

function SignInRoute() {
  const blocked = useSignedOutRoute()
  if (blocked) return <PageLoading />
  return <SignInPage />
}
