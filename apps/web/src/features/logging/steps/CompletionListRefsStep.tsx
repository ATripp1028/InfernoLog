import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { useLoggingFlow } from '@/context/LoggingFlowContext'
import {
  FieldError,
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { digitsOnly, maxValueError, MAX_GDDL_TIER } from '@/lib/numberFormat'

/**
 * Completion step 3: the community difficulty-list tiers for this completion.
 */
export function CompletionListRefsStep() {
  const { level, draft, suggestedGddlTier, patchDraft, setStep } =
    useLoggingFlow()
  if (!level) return null

  const tierError = maxValueError(draft.userGddlTier, MAX_GDDL_TIER)

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <p className="text-sm text-text-secondary">
          Your opinion on the level&apos;s GDDL tier. This is logged alongside
          the completion and helps pre-place the level in your ranking.
        </p>

        <div>
          <FieldLabel htmlFor="user-gddl-tier">
            GDDL tier (your opinion)
          </FieldLabel>
          <Input
            id="user-gddl-tier"
            inputMode="numeric"
            value={draft.userGddlTier}
            onChange={(e) =>
              patchDraft({ userGddlTier: digitsOnly(e.target.value) })
            }
          />
          {tierError ? (
            <FieldError>{tierError}</FieldError>
          ) : (
            suggestedGddlTier != null && (
              <FieldHint>Community tier: {suggestedGddlTier}</FieldHint>
            )
          )}
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('c_session')}>
          Back
        </Button>
        <Button
          onClick={() => setStep('c_review')}
          disabled={tierError != null}
        >
          Continue
        </Button>
      </StepFooter>
    </>
  )
}
