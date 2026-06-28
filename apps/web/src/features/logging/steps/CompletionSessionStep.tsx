import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
import { digitsOnly } from '../format'

export function CompletionSessionStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  const me = useMe()
  if (!level) return null

  const defaultFps = me.data?.defaultFps
  const hasGddlKey = me.data?.hasGddlApiKey ?? false

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
          <div>
            <FieldLabel htmlFor="c-highlight">Highlight URL</FieldLabel>
            <Input
              id="c-highlight"
              value={draft.highlightUrl}
              onChange={(e) => patchDraft({ highlightUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border-subtle pt-4">
          <SectionLabel>GDDL record</SectionLabel>
          {!hasGddlKey && (
            <FieldHint>
              Connect your GDDL API key in Settings to submit records from
              InfernoLog.
            </FieldHint>
          )}
          <ToggleRow
            title="Submit this completion to GDDL"
            subtitle="Uses your connected GDDL key. Optional."
            checked={draft.submitToGddl}
            disabled={!hasGddlKey}
            onChange={(v) => patchDraft({ submitToGddl: v })}
          />
        </div>

        <div className="space-y-3">
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={draft.notes}
            onChange={(e) => patchDraft({ notes: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="Anything you want to remember about this run."
            className="flex w-full rounded-md border border-input bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('c_rating')}>
          Back
        </Button>
        <Button onClick={() => setStep('c_listrefs')}>Continue</Button>
      </StepFooter>
    </>
  )
}

function ToggleRow({
  title,
  subtitle,
  checked,
  disabled,
  onChange,
}: {
  title: string
  subtitle?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className={disabled ? 'opacity-50' : undefined}>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
