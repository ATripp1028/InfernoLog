import { createFileRoute } from '@tanstack/react-router'
import { PageLoading } from '@/components/shell/PageLoading'
import { ForgotPasswordPage } from '@/features/auth/forgotPassword/ForgotPasswordPage'
import { useSignedOutRoute } from '@/lib/useSignedOutRoute'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordRoute,
})

function ForgotPasswordRoute() {
  const blocked = useSignedOutRoute()
  if (blocked) return <PageLoading />
  return <ForgotPasswordPage />
}
