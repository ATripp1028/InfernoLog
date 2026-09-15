import { Link } from '@tanstack/react-router'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import { PasswordInput } from '@/components/inputs/PasswordInput'
import { AuthLayout, AuthNoticeBanner } from '../AuthLayout'
import { useSignInPage } from './useSignInPage'

/**
 * Sign in: email and password, or a connected Google account.
 */
export function SignInPage() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    submitting,
    error,
    notice,
    submit,
    signInWithGoogle,
  } = useSignInPage()

  return (
    <AuthLayout
      title="Welcome back"
      notice={
        notice === 'password-reset' && (
          <AuthNoticeBanner tone="info">
            Your password was reset, and every other device was signed out. Sign
            in with your new password.
          </AuthNoticeBanner>
        )
      }
      connectedAccounts={{
        title: 'Use a connected account',
        description:
          "Only for accounts you've already connected to InfernoLog.",
        googleLabel: 'Continue with Google',
        onGoogle: signInWithGoogle,
      }}
      footer={
        <>
          New to InfernoLog?{' '}
          <Link to="/age-gate" className="text-primary-light hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <h2 className="text-[15px] font-semibold">Sign in with email</h2>
        {error && <AuthNoticeBanner tone="error">{error}</AuthNoticeBanner>}
        <div className="space-y-1.5">
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            className="h-10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="signin-password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-primary-light hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="signin-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="h-10 w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
