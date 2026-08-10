import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { digitsOnly, maxValueError, MAX_FPS } from '../format'
import { DevicePicker } from '../pickers'

/**
 * Completion step 4: what describes this run rather than the level — FPS, device, flags, media, notes.
 */
export function CompletionSessionStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  const me = useMe()
  const defaultDevice = me.data?.defaultDevice

  useEffect(() => {
    if (draft.device === null && defaultDevice) {
      patchDraft({ device: defaultDevice })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDevice])

  if (!level) return null

  const defaultFps = me.data?.defaultFps
  const showHighlightUrl = me.data?.showHighlightUrl ?? true
  const fpsError = maxValueError(draft.fps, MAX_FPS)

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <p className="text-sm text-text-secondary">
          All optional. Everything here describes this run, not the level.
        </p>

        <div className="space-y-3">
          <SectionLabel>Stats</SectionLabel>
          <div>
            <FieldLabel htmlFor="c-fps">FPS</FieldLabel>
            <Input
              id="c-fps"
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
            title="Keep this completion private"
            subtitle="Hide it until you make it public."
            checked={draft.visibility === 'PRIVATE'}
            onChange={(v) =>
              patchDraft({ visibility: v ? 'PRIVATE' : 'PUBLIC' })
            }
          />
        </div>

        <div className="space-y-3">
          <SectionLabel>Media</SectionLabel>
          <div>
            <FieldLabel htmlFor="c-video">Completion video URL</FieldLabel>
            <Input
              id="c-video"
              value={draft.videoUrl}
              onChange={(e) => patchDraft({ videoUrl: e.target.value })}
              placeholder="https://youtube.com/..."
            />
          </div>
          {showHighlightUrl && (
            <div>
              <FieldLabel htmlFor="c-highlight">Highlight URL</FieldLabel>
              <Input
                id="c-highlight"
                value={draft.highlightUrl}
                onChange={(e) => patchDraft({ highlightUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <SectionLabel>Notes</SectionLabel>
          <Textarea
            value={draft.notes}
            onChange={(e) => patchDraft({ notes: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="Anything you want to remember about this run."
          />
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('c_rating')}>
          Back
        </Button>
        <Button
          onClick={() => setStep('c_listrefs')}
          disabled={fpsError != null}
        >
          Continue
        </Button>
      </StepFooter>
    </>
  )
}
