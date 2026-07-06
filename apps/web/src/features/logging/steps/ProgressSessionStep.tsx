import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { StepperInput } from '@/components/ui/stepper-input'
import { Label } from '@/components/ui/label'
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
import { digitsOnly, displayMax, toDisplay, toInternal } from '../format'
import { DevicePicker, GdVersionPicker, GdVersionInfoButton } from './CompletionSessionStep'

export function ProgressSessionStep() {
  const { level, draft, patchDraft, setStep, close } = useLoggingFlow()
  const me = useMe()
  const logProgress = useLogProgress()

  const defaultPercentageVersion = me.data?.defaultPercentageVersion ?? 'TWO_TWO'
  useEffect(() => {
    if (draft.percentageVersion === null) {
      patchDraft({ percentageVersion: defaultPercentageVersion })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPercentageVersion])

  if (!level) return null

  const scale = me.data?.ratingDisplayScale ?? 'ZERO_TO_TEN'
  const defaultFps = me.data?.defaultFps
  const max = displayMax(scale)
  const isTen = scale === 'ZERO_TO_TEN'

  async function submit() {
    if (!level) return
    try {
      await logProgress.mutateAsync(
        buildProgressInput(level, draft, me.data?.defaultFps, me.data?.defaultPercentageVersion)
      )
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
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Slider
              className="w-full sm:flex-1"
              min={0}
              max={max}
              step={1}
              value={[
                draft.enjoyment != null ? toDisplay(draft.enjoyment, scale) : 0,
              ]}
              onValueChange={(vals) =>
                patchDraft({ enjoyment: toInternal(vals[0] ?? 0, scale) })
              }
            />
            <StepperInput
              value={
                draft.enjoyment != null ? toDisplay(draft.enjoyment, scale) : 0
              }
              onChange={(d) => patchDraft({ enjoyment: toInternal(d, scale) })}
              min={0}
              max={max}
              precision={isTen ? 1 : 0}
              deltas={isTen ? [0.5, 1] : [5, 10]}
              aria-label="Enjoyment"
              className="w-full sm:w-auto"
              inputClassName="min-w-0 flex-1 sm:w-12 sm:flex-none"
            />
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
          <div>
            <FieldLabel>Device</FieldLabel>
            <DevicePicker
              value={draft.device}
              onChange={(v) => patchDraft({ device: v })}
            />
          </div>
          {level.levelType === 'CLASSIC' && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Label>% version</Label>
                <GdVersionInfoButton />
              </div>
              <GdVersionPicker
                value={draft.percentageVersion}
                onChange={(v) => patchDraft({ percentageVersion: v })}
              />
            </div>
          )}
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
            onChange={(v) =>
              patchDraft({ visibility: v ? 'PRIVATE' : 'PUBLIC' })
            }
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
