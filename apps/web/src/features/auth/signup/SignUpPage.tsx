import { Link } from '@tanstack/react-router'
import { AuthLayout, AuthNoticeBanner } from '../AuthLayout'
import { SignUpFlowProvider, useSignUpFlow } from './SignUpFlowProvider'
import { CredentialsStep } from './steps/CredentialsStep'
import { VerifyCodeStep } from './steps/VerifyCodeStep'
import { useSignUpPage } from './useSignUpPage'

/**
 * Sign up, after the age gate: create an email-and-password sign-in, or use
 * Google. Both paths go on to the onboarding wizard, where everyone picks a
 * username.
 */
export function SignUpPage() {
  const { notice, signUpWithGoogle } = useSignUpPage()

  return (
    <AuthLayout
      title="Create your account"
      notice={
        notice === 'account-exists' && (
          <AuthNoticeBanner tone="error">
            An account already uses that Google account's email. Sign in to it
            instead.
          </AuthNoticeBanner>
        )
      }
      connectedAccounts={{
        title: 'Sign up with a connected account',
        description: "Uses your Google email. You'll choose a username next.",
        googleLabel: 'Sign up with Google',
        onGoogle: signUpWithGoogle,
      }}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="text-primary-light hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpFlowProvider>
        <StepView />
      </SignUpFlowProvider>
    </AuthLayout>
  )
}

function StepView() {
  const { step } = useSignUpFlow()
  if (step === 'verify') return <VerifyCodeStep />
  return <CredentialsStep />
}
