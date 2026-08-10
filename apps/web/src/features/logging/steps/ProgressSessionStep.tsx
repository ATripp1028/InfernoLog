import { useEffect } from 'react'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Textarea } from '@/components/generic/textarea'
import { RatingRow } from '@/components/data/RatingRow'
import { toast } from '@/components/generic/sonner'
import { useLogProgress } from '@/lib/api/logging'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldError,
  FieldHint,
  FieldLabel,
  LevelHeader,
  SectionLabel,
  StepBody,
  StepFooter,
  ToggleRow,
} from '../components'
import { buildProgressInput, loggingErrorMessage } from '../payload'
import { digitsOnly, maxValueError, MAX_FPS } from '../format'
import { toDisplay, toInternal } from '@/lib/ratingScale'
import { DevicePicker } from '../pickers'

/**
 * Progress step 2: enjoyment plus the same run-describing fields the completion path collects, then the submit.
 */
export function ProgressSessionStep() {
  const { level, draft, patchDraft, setStep, close } = useLoggingFlow()
  const me = useMe()
  const logProgress = useLogProgress()
  const defaultDevice = me.data?.defaultDevice

  useEffect(() => {
    if (draft.device === null && defaultDevice) {
      patchDraft({ device: defaultDevice })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDevice])

  if (!level) return null

  const scale = me.data?.ratingDisplayScale ?? 'ZERO_TO_TEN'
  const defaultFps = me.data?.defaultFps
  const fpsError = maxValueError(draft.fps, MAX_FPS)

  async function submit() {
    if (!level) return
    try {
      await logProgress.mutateAsync(
        buildProgressInput(
          level,
          draft,
          me.data?.defaultFps,
          me.data?.defaultPercentageVersion,
          me.data?.defaultDevice
        )
      )
      toast.success(`Progress logged for ${level.name ?? 'level'}`)
      close()
    } catch (err) {
      toast.error(loggingErrorMessage(err, 'Could not log progress'))
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
          <RatingRow
            label="Score"
            scale={scale}
            value={
              draft.enjoyment != null ? toDisplay(draft.enjoyment, scale) : null
            }
            onChange={(display) =>
              patchDraft({ enjoyment: toInternal(display, scale) })
            }
          />
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
            {fpsError ? (
              <FieldError>{fpsError}</FieldError>
            ) : (
              defaultFps != null && (
                <FieldHint>Defaults to your setting ({defaultFps}).</FieldHint>
              )
            )}
          </div>
          <div>
            <FieldLabel>Device</FieldLabel>
            <DevicePicker
              value={draft.device}
              onChange={(v) => patchDraft({ device: v })}
            />
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
            onChange={(v) =>
              patchDraft({ visibility: v ? 'PRIVATE' : 'PUBLIC' })
            }
          />
        </div>

        <div className="space-y-3">
          <SectionLabel>Notes</SectionLabel>
          <Textarea
            value={draft.notes}
            onChange={(e) => patchDraft({ notes: e.target.value })}
            rows={3}
            maxLength={2000}
          />
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('p_core')}>
          Back
        </Button>
        <Button
          onClick={submit}
          disabled={logProgress.isPending || fpsError != null}
        >
          {logProgress.isPending ? 'Logging…' : 'Log progress'}
        </Button>
      </StepFooter>
    </>
  )
}
