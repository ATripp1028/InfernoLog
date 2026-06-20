import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Segmented } from '@/components/ui/segmented'
import type { DifficultyOpinion } from '@/lib/api/logging'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { digitsOnly } from '../format'

const OPINION_OPTIONS: ReadonlyArray<{ value: DifficultyOpinion; label: string }> =
  [
    { value: 'NOT_DEMON_WORTHY', label: 'Not demon-worthy' },
    { value: 'EASY', label: 'Easy' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HARD', label: 'Hard' },
    { value: 'INSANE', label: 'Insane' },
    { value: 'EXTREME', label: 'Extreme' },
  ]

export function CompletionBasicsStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  if (!level) return null

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

        {!level.isDemon && (
          <Card variant="accent" className="flex gap-3 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                This isn&apos;t a demon
              </p>
              <p className="text-sm text-text-secondary">
                InfernoLog is built for demon tracking. You can still log it — it
                just won&apos;t appear in your difficulty ranking by default.
              </p>
            </div>
          </Card>
        )}

        <div>
          <FieldLabel htmlFor="c-date">Date</FieldLabel>
          <Input
            id="c-date"
            type="date"
            value={draft.date ?? ''}
            onChange={(e) => patchDraft({ date: e.target.value || null })}
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
            <Switch
              checked={draft.dateUncertain}
              onCheckedChange={(v) => patchDraft({ dateUncertain: v })}
            />
            Date is uncertain
          </label>
        </div>

        <div>
          <FieldLabel htmlFor="c-attempts">Attempts</FieldLabel>
          <Input
            id="c-attempts"
            inputMode="numeric"
            value={draft.attempts}
            onChange={(e) => patchDraft({ attempts: digitsOnly(e.target.value) })}
          />
          <FieldHint>Cumulative across all copies and reuploads of the level.</FieldHint>
        </div>

        <div>
          <FieldLabel hint="What you think it deserves — separate from the in-game rating.">
            Your difficulty opinion
          </FieldLabel>
          <Segmented
            options={OPINION_OPTIONS}
            value={draft.difficultyOpinion}
            onChange={(v) => patchDraft({ difficultyOpinion: v })}
            fill={false}
          />
          <FieldHint>
            What you think it deserves — separate from the in-game rating shown
            above. Pick &quot;Not demon-worthy&quot; if you don&apos;t think it
            earns a demon face.
          </FieldHint>
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('find')}>
          Back
        </Button>
        <Button onClick={() => setStep('c_rating')}>Continue</Button>
      </StepFooter>
    </>
  )
}
