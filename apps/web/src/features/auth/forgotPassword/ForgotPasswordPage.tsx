import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import {
  ForgotPasswordFlowProvider,
  useForgotPasswordFlow,
} from './ForgotPasswordFlowProvider'
import { RequestCodeStep } from './steps/RequestCodeStep'
import { ResetPasswordStep } from './steps/ResetPasswordStep'

/**
 * Forgot password: an emailed code, then a new password. For email-and-password
 * sign-ins only — a Google-only account has no password to reset, and the page
 * responds to its address exactly as it does to any other.
 */
export function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-12 text-foreground">
      <div className="w-full max-w-[420px] space-y-5">
        <div className="text-center">
          <Link
            to="/"
            className="font-mono text-xs uppercase tracking-[0.14em] text-primary hover:text-primary-hover"
          >
            InfernoLog
          </Link>
        </div>
        <div className="rounded-card border border-border bg-bg-surface p-6 sm:p-7">
          <ForgotPasswordFlowProvider>
            <StepView />
          </ForgotPasswordFlowProvider>
        </div>
        <Link
          to="/signin"
          className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    </div>
  )
}

function StepView() {
  const { step } = useForgotPasswordFlow()
  if (step === 'reset') return <ResetPasswordStep />
  return <RequestCodeStep />
}
