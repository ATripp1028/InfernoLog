import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { DifficultyOpinion } from '@/lib/api/logging'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { clampPercent, digitsOnly } from '../format'

// The five demon-tier opinions, each shown as a round face button. The sixth
// opinion (NOT_DEMON_WORTHY) is kept as a labelled text button for clarity.
const DEMON_OPINIONS: ReadonlyArray<{
  value: DifficultyOpinion
  label: string
  face: string
}> = [
  { value: 'EASY', label: 'Easy Demon', face: '/assets/gd/demon-easy.png' },
  {
    value: 'MEDIUM',
    label: 'Medium Demon',
    face: '/assets/gd/demon-medium.png',
  },
  { value: 'HARD', label: 'Hard Demon', face: '/assets/gd/demon-hard.png' },
  {
    value: 'INSANE',
    label: 'Insane Demon',
    face: '/assets/gd/demon-insane.png',
  },
  {
    value: 'EXTREME',
    label: 'Extreme Demon',
    face: '/assets/gd/demon-extreme.png',
  },
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
                InfernoLog is built for demon tracking. You can still log it —
                it just won&apos;t appear in your difficulty ranking by default.
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="c-attempts">Attempts</FieldLabel>
            <Input
              id="c-attempts"
              inputMode="numeric"
              value={draft.attempts}
              onChange={(e) =>
                patchDraft({ attempts: digitsOnly(e.target.value) })
              }
            />
            <FieldHint>Cumulative across all copies and reuploads.</FieldHint>
          </div>
          <div>
            <FieldLabel
              htmlFor="c-worstfail"
              hint="Your best run from 0% before beating it."
            >
              Worst fail
            </FieldLabel>
            <Input
              id="c-worstfail"
              inputMode="numeric"
              value={draft.worstFail}
              onChange={(e) =>
                patchDraft({ worstFail: clampPercent(e.target.value) })
              }
            />
            <FieldHint>Best run from 0% before the win.</FieldHint>
          </div>
        </div>

        <div>
          <FieldLabel hint="What you think it deserves — separate from the in-game rating.">
            Your difficulty opinion
          </FieldLabel>
          <DifficultyOpinionSelect
            value={draft.difficultyOpinion}
            onChange={(v) => patchDraft({ difficultyOpinion: v })}
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

function DifficultyOpinionSelect({
  value,
  onChange,
}: {
  value: DifficultyOpinion | null
  onChange: (value: DifficultyOpinion) => void
}) {
  const notWorthy = value === 'NOT_DEMON_WORTHY'
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        aria-pressed={notWorthy}
        onClick={() => onChange('NOT_DEMON_WORTHY')}
        className={cn(
          'h-10 rounded-md border px-4 text-sm font-medium transition-colors',
          notWorthy
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
        )}
      >
        Not demon-worthy
      </button>
      {DEMON_OPINIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex size-12 items-center justify-center rounded-full border transition-all',
              active
                ? 'border-primary bg-primary/20 ring-2 ring-primary'
                : 'border-border bg-bg-elevated/50 hover:bg-bg-elevated/80'
            )}
          >
            <img src={opt.face} alt="" className="size-8" />
          </button>
        )
      })}
    </div>
  )
}
