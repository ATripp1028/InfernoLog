import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api/client'
import { useLogDrop } from '@/lib/api/logging'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { buildDropInput } from '../payload'
import { digitsOnly } from '../format'

export function DropStep() {
  const { level, draft, patchDraft, setStep, close } = useLoggingFlow()
  const logDrop = useLogDrop()
  if (!level) return null

  async function submit() {
    if (!level) return
    try {
      await logDrop.mutateAsync(buildDropInput(level, draft))
      toast.success(`Dropped ${level.name ?? 'level'}`)
      close()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not drop level')
    }
  }

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <p className="text-sm text-text-secondary">
          Your progress history stays intact — you can pick it back up anytime.
        </p>

        <div>
          <FieldLabel htmlFor="d-date">Date dropped</FieldLabel>
          <Input
            id="d-date"
            type="date"
            value={draft.date ?? ''}
            onChange={(e) => patchDraft({ date: e.target.value || null })}
          />
        </div>

        <div>
          <FieldLabel htmlFor="d-attempts" hint="Worth logging.">
            Attempts (optional)
          </FieldLabel>
          <Input
            id="d-attempts"
            inputMode="numeric"
            value={draft.attempts}
            onChange={(e) => patchDraft({ attempts: digitsOnly(e.target.value) })}
          />
          <FieldHint>
            Worth logging — it puts your eventual completion&apos;s attempt count
            in perspective.
          </FieldHint>
        </div>

        <div>
          <FieldLabel htmlFor="d-reason">Reason (optional)</FieldLabel>
          <textarea
            id="d-reason"
            value={draft.droppedReason}
            onChange={(e) => patchDraft({ droppedReason: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="Why are you setting this aside?"
            className="flex w-full rounded-md border border-input bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Keep this private
            </p>
            <p className="text-xs text-text-tertiary">
              Hide the drop from your public profile.
            </p>
          </div>
          <Switch
            checked={draft.visibility === 'PRIVATE'}
            onCheckedChange={(v) =>
              patchDraft({ visibility: v ? 'PRIVATE' : 'PUBLIC' })
            }
          />
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('find')}>
          Back
        </Button>
        <Button variant="destructive" onClick={submit} disabled={logDrop.isPending}>
          {logDrop.isPending ? 'Dropping…' : 'Drop level'}
        </Button>
      </StepFooter>
    </>
  )
}
