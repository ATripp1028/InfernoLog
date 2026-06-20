import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { toast } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api/client'
import { useLogProgress } from '@/lib/api/logging'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  SectionLabel,
  StepBody,
  StepFooter,
} from '../components'
import { buildProgressInput } from '../payload'
import { digitsOnly, displayMax, formatRating, toDisplay, toInternal } from '../format'

export function ProgressSessionStep() {
  const { level, draft, patchDraft, setStep, close } = useLoggingFlow()
  const me = useMe()
  const logProgress = useLogProgress()
  if (!level) return null

  const scale = me.data?.ratingDisplayScale ?? 'ZERO_TO_TEN'
  const defaultFps = me.data?.defaultFps
  const max = displayMax(scale)

  async function submit() {
    if (!level) return
    try {
      await logProgress.mutateAsync(buildProgressInput(level, draft))
      toast.success(`Progress logged for ${level.name ?? 'level'}`)
      close()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not log progress'
      )
    }
  }

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <p className="text-sm text-text-secondary">
          All optional. Everything here describes this run, not the level.
        </p>

        <div>
          <SectionLabel>Enjoyment</SectionLabel>
          <div className="mt-2 flex items-center gap-4">
            <Slider
              className="flex-1"
              min={0}
              max={max}
              step={1}
              value={[draft.enjoyment != null ? toDisplay(draft.enjoyment, scale) : 0]}
              onValueChange={(vals) =>
                patchDraft({ enjoyment: toInternal(vals[0] ?? 0, scale) })
              }
            />
            <span
              className={
                'w-8 text-right font-mono text-sm ' +
                (draft.enjoyment != null ? 'text-text-primary' : 'text-text-tertiary')
              }
            >
              {draft.enjoyment != null ? formatRating(draft.enjoyment, scale) : '—'}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Stats</SectionLabel>
          <div>
            <FieldLabel htmlFor="p-fps">FPS</FieldLabel>
            <Input
              id="p-fps"
              inputMode="numeric"
              value={draft.fps}
              onChange={(e) => patchDraft({ fps: digitsOnly(e.target.value) })}
              placeholder={defaultFps ? String(defaultFps) : undefined}
            />
            {defaultFps != null && (
              <FieldHint>Defaults to your setting ({defaultFps}).</FieldHint>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Flags</SectionLabel>
          <ToggleRow
            title="Played on stream"
            checked={draft.onStream}
            onChange={(v) => patchDraft({ onStream: v })}
          />
          <ToggleRow
            title="Keep this private"
            checked={draft.visibility === 'PRIVATE'}
            onChange={(v) => patchDraft({ visibility: v ? 'PRIVATE' : 'PUBLIC' })}
          />
        </div>

        <div className="space-y-3">
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={draft.notes}
            onChange={(e) => patchDraft({ notes: e.target.value })}
            rows={3}
            maxLength={2000}
            className="flex w-full rounded-md border border-input bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('p_core')}>
          Back
        </Button>
        <Button onClick={submit} disabled={logProgress.isPending}>
          {logProgress.isPending ? 'Logging…' : 'Log progress'}
        </Button>
      </StepFooter>
    </>
  )
}

function ToggleRow({
  title,
  checked,
  onChange,
}: {
  title: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
