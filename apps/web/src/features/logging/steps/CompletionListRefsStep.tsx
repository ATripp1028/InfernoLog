import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { isExtremeContext } from '../payload'

export function CompletionListRefsStep() {
  const { level, draft, suggestedGddlTier, patchDraft, setStep } =
    useLoggingFlow()
  if (!level) return null

  // NLW and AREDL only apply to extreme demons (or a level the user reads as an
  // extreme demon). GDDL applies to every rated level.
  const showExtremeLists = isExtremeContext(
    level.inGameDifficulty,
    draft.difficultyOpinion
  )

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <p className="text-sm text-text-secondary">
          Tier and rank data you want on record. They also help pre-place the
          level in your ranking, but they&apos;re real data worth logging in
          their own right.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="gddl-tier">GDDL tier</FieldLabel>
            <Input
              id="gddl-tier"
              value={draft.gddlTier}
              onChange={(e) => patchDraft({ gddlTier: e.target.value })}
            />
            {suggestedGddlTier != null && (
              <FieldHint>Suggested: {suggestedGddlTier}</FieldHint>
            )}
          </div>
          {showExtremeLists && (
            <div>
              <FieldLabel htmlFor="nlw-tier">NLW tier</FieldLabel>
              <Input
                id="nlw-tier"
                value={draft.nlwTier}
                onChange={(e) => patchDraft({ nlwTier: e.target.value })}
              />
            </div>
          )}
        </div>

        {showExtremeLists && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="aredl-tier">AREDL placement</FieldLabel>
              <Input
                id="aredl-tier"
                value={draft.aredlTier}
                onChange={(e) => patchDraft({ aredlTier: e.target.value })}
                placeholder="#"
              />
            </div>
          </div>
        )}
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('c_session')}>
          Back
        </Button>
        <Button onClick={() => setStep('c_review')}>Continue</Button>
      </StepFooter>
    </>
  )
}
