import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import {
  hasActiveAgeGateFailureCookie,
  markAgeGatePassed,
  setAgeGateFailureCookie,
} from '@/lib/ageGate'
import { MIN_AGE, isOldEnough, parseBirthDateInput } from './ageCheck'

/**
 * Gates Sign Up on age BEFORE anything about a would-be user is collected —
 * before Google OAuth starts (Cognito creates a federated identity on the
 * callback regardless of path) and before an email address is typed. Passing
 * leads to /signup, where the visitor picks email-and-password or Google.
 * Nothing here is ever sent to the server: a failed attempt only sets a
 * client-side cookie so a retry with a different birthdate doesn't work — no
 * fingerprinting, no server-side record of anyone who hasn't actually signed
 * up.
 */
export function AgeGate() {
  const navigate = useNavigate()
  const [birthDate, setBirthDate] = useState('')
  const [rejected, setRejected] = useState(hasActiveAgeGateFailureCookie())

  if (rejected) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-semibold">
          You must be {MIN_AGE} or older to use InfernoLog
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          We're not able to create an account for you at this time.
        </p>
      </div>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!birthDate) return

    // parseBirthDateInput, not `new Date(birthDate)`: the bare 'YYYY-MM-DD'
    // form parses as UTC midnight and would read back a day early west of
    // Greenwich, letting someone one day short of MIN_AGE through.
    if (!isOldEnough(parseBirthDateInput(birthDate), new Date())) {
      setAgeGateFailureCookie()
      setRejected(true)
      return
    }

    markAgeGatePassed()
    void navigate({ to: '/signup' })
  }

  return (
    <div className="flex h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">When's your birthday?</h1>
          <p className="text-sm text-muted-foreground">
            You must be {MIN_AGE} or older to sign up.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birthdate">Date of birth</Label>
          <Input
            id="birthdate"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={!birthDate}>
          Continue
        </Button>
      </form>
    </div>
  )
}
