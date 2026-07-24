import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'

export const GD_22_RELEASE_DATE = '2023-12-19'
export function isPreTwoTwo(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return dateStr.slice(0, 10) < GD_22_RELEASE_DATE
}
import {
  FieldError,
  FieldHint,
  FieldLabel,
  LevelHeader,
  SectionLabel,
  StepBody,
  StepFooter,
} from '../components'
import { digitsOnly, maxValueError, MAX_FPS } from '../format'
import type { Device, GdVersion } from '@/lib/api/logging'

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

function ToggleRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string
  subtitle?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function DevicePicker({
  value,
  onChange,
}: {
  value: Device | null
  onChange: (v: Device | null) => void
}) {
  const options: { value: Device; label: string }[] = [
    { value: 'pc', label: 'PC' },
    { value: 'mobile', label: 'Mobile' },
  ]
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : opt.value)}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function GdVersionPicker({
  value,
  onChange,
}: {
  value: GdVersion | null
  onChange: (v: GdVersion) => void
}) {
  const options: { value: GdVersion; label: string }[] = [
    { value: 'TWO_ONE', label: '2.1' },
    { value: 'TWO_TWO', label: '2.2' },
  ]
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function GdVersionInfoButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What is the percentage version?"
          className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[280px] space-y-2 p-4 text-sm">
        <p className="font-medium text-text-primary">2.1 vs 2.2 percentages</p>
        <p className="text-text-secondary">
          <span className="font-medium text-text-primary">2.1</span> measured
          progress by <span className="italic">distance</span> to the endwall —
          the counter moved faster through high-speed sections and slower
          through low-speed ones.
        </p>
        <p className="text-text-secondary">
          <span className="font-medium text-text-primary">2.2</span> uses{' '}
          <span className="italic">time</span> instead — 100% equals the
          duration of the verification attempt. The same position can show a
          noticeably different number between the two versions.
        </p>
      </PopoverContent>
    </Popover>
  )
}
