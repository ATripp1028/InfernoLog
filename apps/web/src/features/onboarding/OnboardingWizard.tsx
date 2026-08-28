import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PageLoading } from '@/components/shell/PageLoading'
import { Button } from '@/components/generic/button'
import { useMe, useUpdateMe } from '@/lib/api/me'
import { UsernameEditor } from '@/components/inputs/UsernameEditor'
import { LoggingPreferencesFields } from '@/components/inputs/LoggingPreferencesFields'
import {
  RatingSection,
  type RatingSectionHandle,
} from '@/components/inputs/RatingSection'
import { GddlApiKeyEditor } from '@/components/inputs/GddlApiKeyEditor'
import { SettingsSection } from '@/components/generic/settings-section'
import { ImportWizard } from '@/features/import'
import { LegalAcceptance } from './LegalAcceptance'
import {
  STEPS,
  STEP_LABELS,
  initialStep,
  nextStep,
  type Step,
} from './wizardSteps'

/**
 * First-run setup: legal acceptance, rating configuration, logging defaults, and the optional spreadsheet import.
 */
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
      navigate({ to: '/log', replace: true })
      return
    }
    if (step !== null) return
    setStep(initialStep(me.data))
  }, [me.data, step, navigate])

  if (!me.data || me.data.onboardingCompleted || step === null) {
    return <PageLoading />
  }

  const index = STEPS.indexOf(step)

  const goNext = () => {
    const next = nextStep(step)
    if (next) {
      setStep(next)
    } else {
      void update
        .mutateAsync({ onboardingCompleted: true })
        .then(() => navigate({ to: '/log', replace: true }))
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
              i <= index ? 'bg-primary' : 'bg-bg-elevated'
            }`}
            aria-label={STEP_LABELS[s]}
          />
        ))}
      </div>

      {step === 'legal' && (
        <LegalAcceptance
          pending={update.isPending}
          onContinue={() =>
            void update.mutateAsync({ acceptLegal: true }).then(goNext)
          }
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
