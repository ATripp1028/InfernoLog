import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DifficultyFace } from '@/components/DifficultyFace'
import type { Level } from '@/lib/api/logging'
import { supportedTimeZones } from '@/lib/timezone'
import { useLoggingFlow } from './LoggingFlowProvider'

// Computed once — Intl.supportedValuesOf('timeZone') is static per browser session.
const TIME_ZONES = supportedTimeZones()

export { FieldError } from '@/components/ui/field-error'

// Scrollable content region of a step. The panel is a flex column; this grows
// to fill the space between the fixed header and the sticky footer.
export function StepBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex-1 space-y-5 overflow-y-auto px-6 py-5', className)}
    >
      {children}
    </div>
  )
}

// Sticky bottom action bar (Back on the left, primary action on the right).
export function StepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
      {children}
    </div>
  )
}

export function FieldLabel({
  children,
  hint,
  htmlFor,
  className,
}: {
  children: ReactNode
  hint?: string
  htmlFor?: string
  className?: string
}) {
  return (
    <div className={cn('mb-1.5 flex items-center gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{children}</Label>
      {hint && (
        <span title={hint} className="text-text-tertiary">
          <Info size={13} />
        </span>
      )}
    </div>
  )
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-text-tertiary">{children}</p>
}

// Small uppercase divider used inside the session/list steps (STATS, FLAGS…).
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
      {children}
    </p>
  )
}

// The "Bloodbath · by Riot · At the Speed of Light  [Change]" row that sits atop
// every post-resolve step. No surrounding box — it reads against the modal's
// level-thumbnail backdrop. "Change" returns to the find step.
export function LevelHeader({ level }: { level: Level }) {
  const { setStep } = useLoggingFlow()
  const subtitle = [
    level.creator ? `by ${level.creator}` : null,
    level.songName,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={120}
          className="drop-shadow"
        />
        <div>
          <p className="font-semibold leading-tight text-text-primary">
            {level.name ?? `Level #${level.inGameId}`}
          </p>
          {subtitle && (
            <p className="text-xs text-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setStep('find')}
        className="text-primary hover:bg-[var(--color-primary-dim)] hover:text-primary"
      >
        Change
      </Button>
    </div>
  )
}

// A time input merged into the same visual field as a date input (time on
// the left), plus an IANA timezone select that only appears once a time is
// entered — keeps the common no-time case uncluttered. `dateValue`/
// `timeValue` are native `<input>` value strings (`yyyy-MM-dd`/`HH:mm`, or
// `''`); `timezoneValue` is only meaningful once `timeValue !== ''`.
export function DateTimeField({
  dateId,
  dateValue,
  timeValue,
  timezoneValue,
  onDateChange,
  onTimeChange,
  onTimezoneChange,
  disabled,
}: {
  dateId?: string
  dateValue: string
  timeValue: string
  timezoneValue: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  onTimezoneChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-md border border-input bg-[var(--color-bg-surface)] shadow-sm transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
        <input
          type="time"
          aria-label="Time (optional)"
          value={timeValue}
          disabled={disabled}
          onChange={(e) => onTimeChange(e.target.value)}
          className="w-[108px] shrink-0 border-0 bg-transparent px-2 py-1 text-sm text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="w-px shrink-0 bg-border" aria-hidden />
        <input
          id={dateId}
          type="date"
          value={dateValue}
          disabled={disabled}
          onChange={(e) => onDateChange(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1 text-sm text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {timeValue === '' ? (
        <FieldHint>
          Time is optional — leave blank to just log the date.
        </FieldHint>
      ) : (
        <select
          aria-label="Timezone"
          value={timezoneValue}
          disabled={disabled}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="mt-2 h-8 w-full rounded-md border border-input bg-[var(--color-bg-surface)] px-2 text-xs text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
