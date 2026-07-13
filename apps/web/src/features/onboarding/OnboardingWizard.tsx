import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { useMe, useUpdateMe } from '@/lib/api/me'
import { UsernameEditor } from '@/features/settings/components/UsernameEditor'
import { LoggingPreferencesFields } from '@/features/settings/sections/LoggingSection'
import {
  RatingSection,
  type RatingSectionHandle,
} from '@/features/settings/sections/RatingSection'
import { GddlApiKeyEditor } from '@/features/settings/components/GddlApiKeyEditor'
import { SettingsSection } from '@/features/settings/components/SettingsSection'
import { ImportWizard } from '@/features/import/ImportWizard'
import { LegalAcceptance } from './LegalAcceptance'

const STEPS = ['legal', 'username', 'logging', 'rating', 'import', 'gddl'] as const
type Step = (typeof STEPS)[number]

const STEP_LABELS: Record<Step, string> = {
  legal: 'Terms',
  username: 'Username',
  logging: 'Logging',
  rating: 'Rating',
  import: 'Import',
  gddl: 'GDDL',
}

// The placeholder username postAuthentication/signup seeds is
// `<email-localpart>_<8 hex chars>` — used only to decide whether a returning
// (mid-onboarding) user still needs the Username step, so a closed tab
// mid-wizard resumes where it left off instead of redoing completed steps.
function isPlaceholderUsername(username: string, email: string): boolean {
  const localPart = email.split('@')[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${localPart}_[0-9a-f]{8}$`).test(username)
}

export function OnboardingWizard() {
  const me = useMe()
  const update = useUpdateMe()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step | null>(null)
  const ratingSectionRef = useRef<RatingSectionHandle>(null)
  const [savingRating, setSavingRating] = useState(false)

  useEffect(() => {
    if (!me.data) return
    // Defensive: an already-onboarded user shouldn't render the wizard at
    // all (e.g. a Google account with an existing InfernoLog account went
    // through Sign Up by mistake instead of Sign In, or a direct nav here).
    if (me.data.onboardingCompleted) {
      navigate({ to: '/list', replace: true })
      return
    }
    if (step !== null) return
    if (!me.data.legalAcceptedAt) setStep('legal')
    else if (isPlaceholderUsername(me.data.username, me.data.email))
      setStep('username')
    else setStep('logging')
  }, [me.data, step, navigate])

  if (!me.data || me.data.onboardingCompleted || step === null) {
    return <PageLoading />
  }

  const index = STEPS.indexOf(step)

  const goNext = () => {
    const next = STEPS[index + 1]
    if (next) {
      setStep(next)
    } else {
      void update
        .mutateAsync({ onboardingCompleted: true })
        .then(() => navigate({ to: '/list', replace: true }))
    }
  }

  // The category editor has its own Save button in Settings, but here
  // Continue submits the whole Rating step at once — save the categories
  // (if weighted mode and dirty) first, and only advance if that succeeds.
  // A false result means the category editor is in an invalid state (bad
  // weight sum, empty/duplicate name); its own inline validation message is
  // already visible, so just stay put rather than advancing silently.
  const handleRatingContinue = async () => {
    setSavingRating(true)
    try {
      const ok = await ratingSectionRef.current?.save()
      if (ok === false) return
      goNext()
    } finally {
      setSavingRating(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              i <= index ? 'bg-primary' : 'bg-[var(--color-bg-elevated)]'
            }`}
            aria-label={STEP_LABELS[s]}
          />
        ))}
      </div>

      {step === 'legal' && (
        <LegalAcceptance
          pending={update.isPending}
          onContinue={() => void update.mutateAsync({ acceptLegal: true }).then(goNext)}
        />
      )}

      {step === 'username' && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Choose a username</h1>
            <p className="text-sm text-muted-foreground">
              This is how other InfernoLog users will see you.
            </p>
          </div>
          <UsernameEditor me={me.data} startInEditing onSaved={goNext} />
        </div>
      )}

      {step === 'logging' && (
        <StepShell
          title="Logging preferences"
          description="Pre-fill defaults for logging completions. You can change these later in Settings."
          onContinue={goNext}
        >
          <SettingsSection title="" showSeparator={false}>
            <LoggingPreferencesFields me={me.data} />
          </SettingsSection>
        </StepShell>
      )}

      {step === 'rating' && (
        <StepShell
          title="Ratings"
          description="Choose how you want to rate completions. You can change this later in Settings."
          onContinue={() => void handleRatingContinue()}
          pending={savingRating}
        >
          <RatingSection
            ref={ratingSectionRef}
            me={me.data}
            hideCategoryActions
          />
        </StepShell>
      )}

      {step === 'import' && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Import your history</h1>
            <p className="text-sm text-muted-foreground">
              Bring in your existing completion history from a spreadsheet.
              Optional — you can do this anytime from Settings.
            </p>
          </div>
          <ImportWizard me={me.data} onClose={goNext} skipConflictCheck />
        </div>
      )}

      {step === 'gddl' && (
        <StepShell
          title="Connect GDDL"
          description="Optional — link your GDDL account to sync favorites/least-favorites and submit records. You can do this anytime from Settings."
          onContinue={goNext}
          continueLabel="Finish"
        >
          <SettingsSection title="" showSeparator={false}>
            <GddlApiKeyEditor me={me.data} />
          </SettingsSection>
        </StepShell>
      )}
    </div>
  )
}

interface StepShellProps {
  title: string
  description?: string
  onContinue: () => void
  continueLabel?: string
  pending?: boolean
  children: React.ReactNode
}

function StepShell({
  title,
  description,
  onContinue,
  continueLabel = 'Continue',
  pending,
  children,
}: StepShellProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
      <Button onClick={onContinue} className="w-full" disabled={pending}>
        {pending ? 'Saving…' : continueLabel}
      </Button>
    </div>
  )
}
